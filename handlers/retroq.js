console.log('[RETROQ] Module loading...');

const fs = require('fs');
const { randomInt } = require('crypto');
const Redis = require('ioredis');

// Initialize Redis client
const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: process.env.REDIS_PORT || 6379
});

redis.on('error', (err) => {
  console.error('[RETROQ] Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('[RETROQ] Redis connected successfully');
});

// Store recently sent quotes per chat to prevent duplicates
const recentQuotes = new Map();
const MAX_RECENT_QUOTES = 50; // Number of recent quotes to track per chat

// Rate limiting
const RATE_LIMIT_WINDOW = 5 * 60; // 5 minutes in seconds
const RATE_LIMIT_MAX_USES = 10;

/**
 * Sanitize text to prevent HTML parsing errors
 */
function sanitizeText(text) {
  if (!text) return '';
  
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Check if a quote has accessible text content
 */
function hasAccessibleContent(quote) {
  // Check if quote has text and it's not empty/whitespace only
  if (!quote.text || quote.text.trim().length === 0) {
    return false;
  }
  
  // Check if the quote only contains a reply to a message with media but no text
  if (quote.reply_to_message && 
      (quote.reply_to_message.animation || 
       quote.reply_to_message.document || 
       quote.reply_to_message.photo ||
       quote.reply_to_message.video ||
       quote.reply_to_message.sticker) &&
      (!quote.reply_to_message.text || quote.reply_to_message.text.trim().length === 0) &&
      (!quote.reply_to_message.caption || quote.reply_to_message.caption.trim().length === 0)) {
    return false;
  }
  
  return true;
}

/**
 * Get recent quotes for a chat
 */
function getRecentQuotes(chatId) {
  return recentQuotes.get(chatId) || [];
}

/**
 * Add quote to recent quotes for a chat
 */
function addRecentQuote(chatId, quoteId) {
  let recent = recentQuotes.get(chatId) || [];
  
  // Add the new quote ID to the beginning
  recent.unshift(quoteId);
  
  // Keep only the most recent quotes
  if (recent.length > MAX_RECENT_QUOTES) {
    recent = recent.slice(0, MAX_RECENT_QUOTES);
  }
  
  recentQuotes.set(chatId, recent);
}

/**
 * Get a random quote that hasn't been sent recently
 */
function getRandomUniqueQuote(accessibleQuoteIds, recentQuoteIds) {
  // Filter out recently sent quotes
  const availableQuotes = accessibleQuoteIds.filter(id => !recentQuoteIds.includes(id));
  
  // If we've exhausted all quotes, reset and use all quotes again
  if (availableQuotes.length === 0) {
    console.log('All quotes have been sent recently, resetting for chat');
    return accessibleQuoteIds[typeof randomInt === 'function' 
      ? randomInt(0, accessibleQuoteIds.length - 1)
      : Math.floor(Math.random() * accessibleQuoteIds.length)];
  }
  
  // Return a random quote from available quotes
  const randomIndex = typeof randomInt === 'function' 
    ? randomInt(0, availableQuotes.length - 1)
    : Math.floor(Math.random() * availableQuotes.length);
    
  return availableQuotes[randomIndex];
}

/**
 * Check if user is rate limited using Redis
 */
async function checkRateLimit(userId) {
  const key = `retroq_rate:${userId}`;
  
  try {
    // Use Redis INCR with expiry to implement rate limiting
    const current = await redis.incr(key);
    
    if (current === 1) {
      // First request in the window, set expiry
      await redis.expire(key, RATE_LIMIT_WINDOW);
    }
    
    if (current > RATE_LIMIT_MAX_USES) {
      // Get remaining TTL
      const ttl = await redis.ttl(key);
      return { allowed: false, timeLeft: ttl > 0 ? ttl : RATE_LIMIT_WINDOW };
    }
    
    return { allowed: true, uses: current };
  } catch (error) {
    console.error('[RETROQ] Redis error:', error);
    // Fallback - allow the request if Redis fails
    return { allowed: true };
  }
}

/**
 * Sends a random quote from the retro quotes JSON file
 */
module.exports = async (ctx) => {
  console.log('[RETROQ] Handler called');
  try {
    // Check rate limit
    const userId = ctx.from?.id;
    if (!userId) {
      console.error('[RETROQ] No user ID found in context');
      return;
    }
    console.log(`[RETROQ] User ${userId} requesting quote`);
    const rateCheck = await checkRateLimit(userId);
    console.log(`[RETROQ] Rate check for user ${userId}:`, rateCheck);
    
    if (!rateCheck.allowed) {
      const minutes = Math.floor(rateCheck.timeLeft / 60);
      const seconds = rateCheck.timeLeft % 60;
      const timeString = minutes > 0 ? `${minutes} мин. ${seconds} сек.` : `${seconds} сек.`;
      
      console.log(`[RETROQ] User ${userId} rate limited for ${timeString}`);
      
      return ctx.replyWithHTML(
        `⏳ <i>Слишком много запросов! Подождите ${timeString} перед следующим использованием команды.</i>`,
        {
          reply_to_message_id: ctx.message.message_id,
          allow_sending_without_reply: true
        }
      ).then((msg) => {
        setTimeout(() => {
          ctx.deleteMessage().catch(() => {});
          ctx.deleteMessage(msg.message_id).catch(() => {});
        }, 5000);
      });
    }
    
    await ctx.replyWithChatAction('typing');
    
    const chatId = ctx.chat.id;
    const filePath = '/app/quotes.json';
    
    if (!fs.existsSync(filePath)) {
      console.error(`Quotes file not found at ${filePath}`);
      return ctx.replyWithHTML(`Ошибка: цитатник не найден.`, {
        reply_to_message_id: ctx.message.message_id,
        allow_sending_without_reply: true
      });
    }
    
    let data;
    try {
      data = fs.readFileSync(filePath, 'utf8');
      console.log(`Successfully read quotes file, size: ${data.length} bytes`);
    } catch (readError) {
      console.error(`Error reading quotes file: ${readError.message}`);
      return ctx.replyWithHTML(`Ошибка чтения файла цитатника.`, {
        reply_to_message_id: ctx.message.message_id,
        allow_sending_without_reply: true
      });
    }
    
    let quotes;
    try {
      quotes = JSON.parse(data);
      console.log(`Successfully parsed JSON with ${Object.keys(quotes).length} quotes`);
    } catch (parseError) {
      console.error(`Error parsing JSON: ${parseError.message}`);
      return ctx.replyWithHTML(`Ошибка парсинга файла цитатника.`, {
        reply_to_message_id: ctx.message.message_id,
        allow_sending_without_reply: true
      });
    }
    
    const quoteIds = Object.keys(quotes);
    if (quoteIds.length === 0) {
      return ctx.replyWithHTML('Цитат не найдено!', {
        reply_to_message_id: ctx.message.message_id,
        allow_sending_without_reply: true
      });
    }
    
    // Filter quotes to only include those with accessible text content
    const accessibleQuoteIds = quoteIds.filter(id => hasAccessibleContent(quotes[id]));
    
    if (accessibleQuoteIds.length === 0) {
      return ctx.replyWithHTML('Нет доступных цитат с текстом!', {
        reply_to_message_id: ctx.message.message_id,
        allow_sending_without_reply: true
      });
    }
    
    // Get recent quotes for this chat
    const recentQuoteIds = getRecentQuotes(chatId);
    
    // Get a unique quote that hasn't been sent recently
    const quoteId = getRandomUniqueQuote(accessibleQuoteIds, recentQuoteIds);
    const quote = quotes[quoteId];
    
    // Add this quote to recent quotes
    addRecentQuote(chatId, quoteId);
    
    // Format the date
    const date = new Date(quote.time * 1000);
    const formattedDate = date.toLocaleDateString('ru-RU', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    // Build the message
    let messageText = `<b>Старая цитата #${quoteId}</b>\n`;
    
    // Determine quote source
    if (parseInt(quoteId) < 0) {
        messageText += '<i>Цитата из IRC</i>\n';
    } else {
        messageText += '<i>Цитата из Telegram</i>\n';
    }
    
    messageText += `<b>Сохранил:</b> ${sanitizeText(quote.from) || '<i>кто-то</i>'}\n`;
    messageText += `<b>Дата:</b> ${formattedDate}\n`;    
    
    // Add the quote text (we know it exists because we filtered for it)
    messageText += sanitizeText(quote.text);
    
    // Reply with the message
    await ctx.replyWithHTML(messageText, {
        reply_to_message_id: ctx.message.message_id,
        allow_sending_without_reply: true
    });
    
  } catch (error) {
    console.error('Error in retroq handler:', error);
    await ctx.replyWithHTML(`Ошибка обращения к цитатнику: ${error.message}`, {
      reply_to_message_id: ctx.message.message_id,
      allow_sending_without_reply: true
    });
  }
};