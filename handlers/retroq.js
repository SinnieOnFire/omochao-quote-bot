const fs = require('fs');
const { randomInt } = require('crypto');

/**
 * Sanitize text to prevent HTML parsing errors
 * Replaces < and > with HTML entities when they appear to be IRC-style nicknames
 */
function sanitizeText(text) {
  if (!text) return '';
  
  // Replace IRC-style nicknames like <username> with escaped versions
  return text.replace(/<([^>]+)>/g, '&lt;$1&gt;');
}

/**
 * Sends a random quote from the retro quotes JSON file
 */
module.exports = async (ctx) => {
  try {
    // Show typing indicator
    await ctx.replyWithChatAction('typing');
    
    const filePath = '/app/quotes.json';
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`Quotes file not found at ${filePath}`);
      return ctx.replyWithHTML(`Error: Quotes file not found.`, {
        reply_to_message_id: ctx.message.message_id,
        allow_sending_without_reply: true
      });
    }
    
    // Read the file
    let data;
    try {
      data = fs.readFileSync(filePath, 'utf8');
      console.log(`Successfully read quotes file, size: ${data.length} bytes`);
    } catch (readError) {
      console.error(`Error reading quotes file: ${readError.message}`);
      return ctx.replyWithHTML(`Error reading quotes file.`, {
        reply_to_message_id: ctx.message.message_id,
        allow_sending_without_reply: true
      });
    }
    
    // Parse the JSON
    let quotes;
    try {
      quotes = JSON.parse(data);
      console.log(`Successfully parsed JSON with ${Object.keys(quotes).length} quotes`);
    } catch (parseError) {
      console.error(`Error parsing JSON: ${parseError.message}`);
      return ctx.replyWithHTML(`Error parsing quotes file JSON.`, {
        reply_to_message_id: ctx.message.message_id,
        allow_sending_without_reply: true
      });
    }
    
    // Get a random quote
    const quoteIds = Object.keys(quotes);
    if (quoteIds.length === 0) {
      return ctx.replyWithHTML('No quotes found in the file!', {
        reply_to_message_id: ctx.message.message_id,
        allow_sending_without_reply: true
      });
    }
    
    // Use randomInt from crypto for better randomness if available, or fallback to Math.random
    const randomIndex = typeof randomInt === 'function' 
      ? randomInt(0, quoteIds.length) 
      : Math.floor(Math.random() * quoteIds.length);
      
    const quoteId = quoteIds[randomIndex];
    const quote = quotes[quoteId];
    
    // Format the date
    const date = new Date(quote.time * 1000);
    const formattedDate = date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
    
    // Build the message - sanitize the text to prevent HTML parsing errors
    let messageText = `<b>Старая цитата #${quoteId}</b>\n`;
    messageText += `<b>Сохранил:</b> ${sanitizeText(quote.from) || 'хз'}\n`;
    messageText += `<b>Дата:</b> ${formattedDate}\n\n`;
    messageText += sanitizeText(quote.text) || '[No text content]';
    
    // Add additional info based on quote type
    if (quote.photo) {
      messageText += '\n\n<i>This quote originally included an image</i>';
    } else if (quote.reply_to_message) {
      messageText += '\n\n<i>This was a reply to another message</i>';
    }
    
    // Send the message
    await ctx.replyWithHTML(messageText, {
      reply_to_message_id: ctx.message.message_id,
      allow_sending_without_reply: true
    });
    
  } catch (error) {
    console.error('Error in retroq handler:', error);
    await ctx.replyWithHTML(`Error fetching retro quote.`, {
      reply_to_message_id: ctx.message.message_id,
      allow_sending_without_reply: true
    });
  }
};