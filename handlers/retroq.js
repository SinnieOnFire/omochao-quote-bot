const fs = require('fs');
const path = require('path');
const { randomInt } = require('crypto');

// Use an absolute path or environment variable for the quotes file
// You can set this as an environment variable in your .env file
const RETRO_QUOTES_PATH = process.env.RETRO_QUOTES_PATH || '/app/quotes/quotes.json';

// Cache for the quotes to avoid reading the file on every request
let quotesCache = null;
let lastCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

/**
 * Loads quotes from the JSON file with caching
 */
async function loadQuotes() {
  const currentTime = Date.now();
  
  // Return cached quotes if they're still fresh
  if (quotesCache && (currentTime - lastCacheTime < CACHE_TTL)) {
    return quotesCache;
  }
  
  console.log(`Attempting to load retro quotes from: ${RETRO_QUOTES_PATH}`);
  
  // Read and parse the JSON file
  try {
    // Check if file exists first
    if (!fs.existsSync(RETRO_QUOTES_PATH)) {
      throw new Error(`Quotes file not found at ${RETRO_QUOTES_PATH}`);
    }
    
    const data = await fs.promises.readFile(RETRO_QUOTES_PATH, 'utf8');
    quotesCache = JSON.parse(data);
    lastCacheTime = currentTime;
    console.log(`Successfully loaded ${Object.keys(quotesCache).length} retro quotes from ${RETRO_QUOTES_PATH}`);
    return quotesCache;
  } catch (error) {
    console.error(`Error loading retro quotes from ${RETRO_QUOTES_PATH}:`, error);
    throw error;
  }
}

/**
 * Formats the quote for display
 */
function formatQuote(quote, quoteId) {
  const date = new Date(quote.time * 1000);
  const formattedDate = date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
  
  let messageText = `<b>Retro Quote #${quoteId}</b>\n`;
  messageText += `<b>From:</b> ${quote.from}\n`;
  messageText += `<b>Date:</b> ${formattedDate}\n\n`;
  messageText += quote.text || '[No text content]';
  
  return messageText;
}

/**
 * Sends a random quote from the retro quotes JSON file
 */
module.exports = async (ctx) => {
  try {
    // Show typing indicator
    await ctx.replyWithChatAction('typing');
    
    // Load quotes
    const quotes = await loadQuotes();
    const quoteIds = Object.keys(quotes);
    
    if (quoteIds.length === 0) {
      return ctx.replyWithHTML('No retro quotes found!', {
        reply_to_message_id: ctx.message.message_id,
        allow_sending_without_reply: true
      });
    }
    
    // Select a random quote
    const randomIndex = randomInt(0, quoteIds.length);
    const quoteId = quoteIds[randomIndex];
    const quote = quotes[quoteId];
    
    // Format and send the quote
    const messageText = formatQuote(quote, quoteId);
    
    // If the quote has a photo, send it with the message
    if (quote.photo) {
      // For retro quotes with photos, we'll notify that we can't display the original image
      await ctx.replyWithHTML(messageText + '\n\n<i>This quote originally had an image that is no longer available.</i>', {
        reply_to_message_id: ctx.message.message_id,
        allow_sending_without_reply: true
      });
    } else if (quote.reply_to_message) {
      // If it's a reply to another message, include that information
      let replyInfo = '\n\n<i>This was a reply to another message</i>';
      await ctx.replyWithHTML(messageText + replyInfo, {
        reply_to_message_id: ctx.message.message_id,
        allow_sending_without_reply: true
      });
    } else {
      await ctx.replyWithHTML(messageText, {
        reply_to_message_id: ctx.message.message_id,
        allow_sending_without_reply: true
      });
    }
  } catch (error) {
    console.error('Error sending retro quote:', error);
    await ctx.replyWithHTML(`Error fetching retro quote. Please check server logs for details.`, {
      reply_to_message_id: ctx.message.message_id,
      allow_sending_without_reply: true
    });
  }
};