const fs = require('fs')
const path = require('path')

// Path to the text quotes file
const textQuotesPath = path.join(process.cwd(), 'text-quotes.json')

// Function to delete quote from text-quotes.json by sticker file_unique_id
async function deleteTextQuoteBySticker(fileUniqueId) {
  try {
    if (!fs.existsSync(textQuotesPath)) {
      return false
    }

    const fileContent = fs.readFileSync(textQuotesPath, 'utf8')
    let textQuotes = JSON.parse(fileContent)
    
    // Find and delete quote with matching sticker_file_unique_id
    let deleted = false
    for (const key in textQuotes) {
      if (textQuotes[key].sticker_file_unique_id === fileUniqueId) {
        delete textQuotes[key]
        deleted = true
        break
      }
    }

    if (deleted) {
      // Write back to file
      fs.writeFileSync(textQuotesPath, JSON.stringify(textQuotes, null, 2), 'utf8')
    }

    return deleted
  } catch (error) {
    console.error('Error deleting text quote:', error)
    return false
  }
}

module.exports = async ctx => {
  const stickerLinkPrefix = 'https://t.me/addstickers/'
  let result

  if (!ctx.message.reply_to_message) {
    return ctx.replyWithHTML(ctx.i18n.t('sticker.empty_forward'))
  }

  const replyMessage = ctx.message.reply_to_message
  if (!replyMessage.sticker) {
    return ctx.replyWithHTML(ctx.i18n.t('sticker.empty_forward'))
  }

  // Check if sticker is from group's sticker set
  if (ctx.group.info.stickerSet && replyMessage.sticker.set_name && ctx.group.info.stickerSet.name === replyMessage.sticker.set_name) {
    try {
      await ctx.telegram.deleteStickerFromSet(replyMessage.sticker.file_id)
      
      // Also delete from text-quotes.json
      await deleteTextQuoteBySticker(replyMessage.sticker.file_unique_id)
      
      result = ctx.i18n.t('sticker.delete.suc', {
        link: `${stickerLinkPrefix}${ctx.group.info.stickerSet.name}`
      })
    } catch (error) {
      const errorMessage = error.message.toLowerCase()
      let reason

      if (errorMessage.includes('not found')) {
        reason = ctx.i18n.t('sticker.delete.error.not_found')
      } else if (errorMessage.includes('rights') || errorMessage.includes('administrator')) {
        reason = ctx.i18n.t('sticker.delete.error.rights')
      } else {
        console.error('Telegram sticker deletion error:', error)
        reason = ctx.i18n.t('sticker.delete.error.generic', {
          error: errorMessage
        })
      }

      result = ctx.i18n.t('sticker.delete.error.telegram', { reason })
    }
  } else {
    // Delete from quotes database
    try {
      const group = await ctx.db.Group.findOne({ group_id: ctx.chat.id })
      const quote = await ctx.db.Quote.findOne({
        group: group,
        file_unique_id: replyMessage.sticker.file_unique_id
      })

      if (!quote) {
        return ctx.replyWithHTML(ctx.i18n.t('sticker.delete_random.not_found'))
      }

      const deleteResult = await ctx.db.Quote.deleteOne({ _id: quote._id })
      if (deleteResult.deletedCount === 1) {
        // Also delete from text-quotes.json
        await deleteTextQuoteBySticker(replyMessage.sticker.file_unique_id)
        
        result = ctx.i18n.t('sticker.delete_random.suc')
      } else {
        result = ctx.i18n.t('sticker.delete_random.error', {
          error: 'Failed to delete from database'
        })
      }
    } catch (err) {
      console.error('Database deletion error:', err)
      result = ctx.i18n.t('sticker.delete_random.error', {
        error: 'Database error occurred'
      })
    }
  }

  if (result) {
    await ctx.replyWithHTML(result, {
      reply_to_message_id: ctx.message.message_id,
      allow_sending_without_reply: true
    })
  }
}
