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

// Store recently sent quotes per chat to prevent duplicates
const recentQuotes = new Map();
const MAX_RECENT_QUOTES = 50; // Number of recent quotes to track per chat

// Rate limiting
const RATE_LIMIT_WINDOW = 5 * 60; // 5 minutes in seconds
const RATE_LIMIT_MAX_USES = 5;

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
 * Check if a quote has any displayable content (text or photo)
 */
function hasDisplayableContent(quote) {
  // Quote has text
  if (quote.text && quote.text.trim().length > 0) {
    return true;
  }
  
  // Quote has photo
  if (quote.photo && quote.photo.file_id) {
    return true;
  }
  
  // Quote has other media that we might support in the future
  if (quote.animation || quote.video || quote.document) {
    return true;
  }
  
  return false;
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
    // Handle single quote case
    if (accessibleQuoteIds.length === 1) {
      return accessibleQuoteIds[0];
    }
    return accessibleQuoteIds[typeof randomInt === 'function' 
      ? randomInt(0, accessibleQuoteIds.length - 1)
      : Math.floor(Math.random() * accessibleQuoteIds.length)];
  }
  
  // Handle single available quote
  if (availableQuotes.length === 1) {
    return availableQuotes[0];
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
  try {
    // Check rate limit
    const userId = ctx.from?.id;
    if (!userId) {
      console.error('[RETROQ] No user ID found in context');
      return;
    }
    const rateCheck = await checkRateLimit(userId);
    
    if (!rateCheck.allowed) {
      const minutes = Math.floor(rateCheck.timeLeft / 60);
      const seconds = rateCheck.timeLeft % 60;
      const timeString = minutes > 0 ? `${minutes} мин. ${seconds} сек.` : `${seconds} сек.`;
      
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
    
    // Extract search keywords or ID from command
    const commandText = ctx.message.text;
    const commandMatch = commandText.match(/^\/retroq(?:@\S+)?\s*(.*)$/);
    const searchInput = commandMatch && commandMatch[1] ? commandMatch[1].trim() : '';
    
    // Check if input is a quote ID (e.g., #196 or 196)
    const idMatch = searchInput.match(/^#?(\d+)$/);
    const isIdSearch = idMatch !== null;
    const searchKeywords = isIdSearch ? '' : searchInput.toLowerCase();
    
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
    
    let quoteId;
    let quote;
    
    // Handle ID-based search
    if (isIdSearch) {
      quoteId = idMatch[1];
      quote = quotes[quoteId];
      
      if (!quote) {
        return ctx.replyWithHTML(`Цитата №${quoteId} не найдена!`, {
          reply_to_message_id: ctx.message.message_id,
          allow_sending_without_reply: true
        });
      }
      
      if (!hasDisplayableContent(quote)) {
        return ctx.replyWithHTML(`Цитата №${quoteId} не содержит отображаемого контента!`, {
          reply_to_message_id: ctx.message.message_id,
          allow_sending_without_reply: true
        });
      }
    } else {
      // Filter quotes to only include those with displayable content
      let accessibleQuoteIds = quoteIds.filter(id => hasDisplayableContent(quotes[id]));
      
      // If search keywords are provided, filter quotes by keywords
      if (searchKeywords) {
        accessibleQuoteIds = accessibleQuoteIds.filter(id => {
          const quote = quotes[id];
          const quoteText = quote.text ? quote.text.toLowerCase() : '';
          return quoteText.includes(searchKeywords);
        });
        
        if (accessibleQuoteIds.length === 0) {
          return ctx.replyWithHTML(`Не найдено цитат, содержащих «${sanitizeText(searchKeywords)}»`, {
            reply_to_message_id: ctx.message.message_id,
            allow_sending_without_reply: true
          });
        }
      }
      
      if (accessibleQuoteIds.length === 0) {
        return ctx.replyWithHTML('Нет доступных цитат!', {
          reply_to_message_id: ctx.message.message_id,
          allow_sending_without_reply: true
        });
      }
      
      // Get recent quotes for this chat
      const recentQuoteIds = getRecentQuotes(chatId);
      
      // Get a unique quote that hasn't been sent recently
      quoteId = getRandomUniqueQuote(accessibleQuoteIds, recentQuoteIds);
      quote = quotes[quoteId];
    }
    
    // Add this quote to recent quotes (only for random selection, not ID-based)
    if (!isIdSearch) {
      addRecentQuote(chatId, quoteId);
    }
    
    // Build the message
    let messageText = `<b>Старая цитата №${quoteId}</b>\n`;
    
    // Determine quote source
    if (parseInt(quoteId) < 0) {
        messageText += '<i>Цитата из IRC</i>\n';
    } else {
        messageText += '<i>Цитата из Telegram</i>\n';
    }
    
    messageText += `<b>Сохранил:</b> ${sanitizeText(quote.from) || '[ДАННЫЕ УДАЛЕНЫ]'}\n`;
    
    // Only add date if time is not 0
    if (quote.time && quote.time > 0) {
      const date = new Date(quote.time * 1000);
      const formattedDate = date.toLocaleDateString('ru-RU', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      const formattedTime = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      messageText += `<b>Дата:</b> ${formattedDate} ${formattedTime}\n`;
    }    
    
    // Add the quote text if it exists
    if (quote.text && quote.text.trim().length > 0) {
      messageText += sanitizeText(quote.text);
    }
    
    // Check if quote has a photo
    if (quote.photo && quote.photo.file_id) {
      try {
        // If there's both text and photo, send photo with caption
        if (quote.text && quote.text.trim().length > 0) {
          await ctx.telegram.sendPhoto(ctx.chat.id, quote.photo.file_id, {
            caption: messageText,
            parse_mode: 'HTML',
            reply_to_message_id: ctx.message.message_id,
            allow_sending_without_reply: true
          });
        } else {
          // Photo only - add a note that this quote contains only a photo
          messageText += '<i>[Эта цитата содержит только изображение]</i>';
          await ctx.telegram.sendPhoto(ctx.chat.id, quote.photo.file_id, {
            caption: messageText,
            parse_mode: 'HTML',
            reply_to_message_id: ctx.message.message_id,
            allow_sending_without_reply: true
          });
        }
      } catch (photoError) {
        // If photo sending fails (e.g., file_id expired), fall back to text only
        console.error('Error sending photo for quote', quoteId, ':', photoError.message || photoError);
        console.error('Photo details:', quote.photo);
        if (quote.text && quote.text.trim().length > 0) {
          await ctx.replyWithHTML(messageText + '\n<i>[В цитате была картинка которая сейчас недоступна]</i>', {
            reply_to_message_id: ctx.message.message_id,
            allow_sending_without_reply: true
          });
        } else {
          await ctx.replyWithHTML(messageText + '\n<i>[В цитате была картинка которая сейчас недоступна]</i>', {
            reply_to_message_id: ctx.message.message_id,
            allow_sending_without_reply: true
          });
        }
      }
    } else {
      // Text only quote
      await ctx.replyWithHTML(messageText, {
        reply_to_message_id: ctx.message.message_id,
        allow_sending_without_reply: true
      });
    }
    
  } catch (error) {
    console.error('Error in retroq handler:', error);
    await ctx.replyWithHTML(`Ошибка обращения к цитатнику: ${error.message}`, {
      reply_to_message_id: ctx.message.message_id,
      allow_sending_without_reply: true
    });
  }
};
