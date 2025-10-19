const Composer = require('telegraf/composer')
const got = require('got')
const handleOLolsBotResponse = require('./olols-bot-response')
const composer = new Composer()

composer.use(async (ctx, next) => {
  // Check for new_chat_members in regular message updates
  if (ctx.update.message && ctx.update.message.new_chat_members) {
    console.log('New members detected:', ctx.update.message.new_chat_members)
    try {
      const { chat, new_chat_members } = ctx.update.message

      // Process each new member
      for (const member of new_chat_members) {
        // Don't send message if a bot joined
        if (!member.is_bot) {
          let message
          if (member.username) {
            // If user has username, use @username (will auto-mention)
            message = `@${member.username}, назови три любимых игры из серии Sonic the Hedgehog чтобы продолжить.`
            console.log('Sending welcome message for user:', `@${member.username}`, 'to chat:', chat.id)
            await ctx.telegram.sendMessage(chat.id, message)
          } else {
            // If no username, use HTML mention with user ID
            message = `<a href="tg://user?id=${member.id}">${member.first_name}</a>, назови три любимых игры из серии Sonic the Hedgehog чтобы продолжить.`
            console.log('Sending welcome message for user:', member.first_name, 'to chat:', chat.id)
            await ctx.telegram.sendMessage(chat.id, message, { parse_mode: 'HTML' })
          }

          // Query @oLolsBot for detailed user information
          try {
            // @oLolsBot accepts both usernames (@username) and user IDs
            // Prefer username if available, otherwise use ID
            const oLolsBotQuery = member.username ? `@${member.username}` : `${member.id}`
            console.log('Sending user info to @oLolsBot:', oLolsBotQuery)

            // Register this query as pending so we can match the response later
            handleOLolsBotResponse.addPendingQuery(
              member.id.toString(),
              member.username,
              chat.title || chat.id.toString()
            )

            await ctx.telegram.sendMessage('@oLolsBot', oLolsBotQuery)
            console.log('Query sent to @oLolsBot for user:', oLolsBotQuery)

            // Also send notification to @sinnie that we're checking the user
            let notificationMessage = `🔍 <b>New User Joined</b>\n\n`
            notificationMessage += `<b>Chat:</b> ${chat.title || chat.id}\n`
            notificationMessage += `<b>User ID:</b> <code>${member.id}</code>\n`
            notificationMessage += `<b>Name:</b> ${member.first_name}`
            if (member.last_name) notificationMessage += ` ${member.last_name}`
            if (member.username) notificationMessage += ` (@${member.username})`
            notificationMessage += `\n\n⏳ Querying @oLolsBot with: <code>${oLolsBotQuery}</code>`

            await ctx.telegram.sendMessage('@sinnie', notificationMessage, { parse_mode: 'HTML' })
            console.log('Notification sent to @sinnie')
          } catch (lolsError) {
            console.error('Error querying @oLolsBot:', lolsError)
            // Send error notification to @sinnie
            const errorMessage = `❌ <b>@oLolsBot Query Failed</b>\n\n` +
              `<b>User ID:</b> <code>${member.id}</code>\n` +
              `<b>Error:</b> ${lolsError.message}`
            await ctx.telegram.sendMessage('@sinnie', errorMessage, { parse_mode: 'HTML' }).catch(() => {})
          }
        } else {
          console.log('Bot joined, not sending message')
        }
      }
    } catch (error) {
      console.error('Error in user join handler:', error)
    }
  }

  return next()
})

module.exports = composer
