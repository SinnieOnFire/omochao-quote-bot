const fs = require('fs');
const { randomInt } = require('crypto');

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
 * Sends a random quote from the retro quotes JSON file
 */
module.exports = async (ctx) => {
  try {
    await ctx.replyWithChatAction('typing');
    
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
    
    const randomIndex = typeof randomInt === 'function' 
      ? randomInt(0, quoteIds.length - 1)
      : Math.floor(Math.random() * quoteIds.length);
      
    const quoteId = quoteIds[randomIndex];
    const quote = quotes[quoteId];
    
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
    // Add the quote text if it exists
    if (quote.text && quote.text.trim()) {
        messageText += sanitizeText(quote.text);
    } else {
        // If there's no text but there's a photo, note that this is a photo quote
        if (quote.photo) {
            messageText += '<i>[В цитате была картинка которая больше недоступна]</i>';
        } else {
            messageText += '[Не содержит текст]';
        }
    }
    
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