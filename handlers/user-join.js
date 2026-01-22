const Composer = require('telegraf/composer')
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
          // Send welcome message
          try {
            let message
            if (member.username) {
              // If user has username, use @username (will auto-mention)
              message = `@${member.username}, назови три любимых игры из серии Sonic the Hedgehog, чтобы продолжить.`
              console.log('Sending welcome message for user:', `@${member.username}`, 'to chat:', chat.id)
              await ctx.telegram.sendMessage(chat.id, message)
            } else {
              // If no username, use HTML mention with user ID
              message = `<a href="tg://user?id=${member.id}">${member.first_name}</a>, назови три любимых игры из серии Sonic the Hedgehog чтобы продолжить.`
              console.log('Sending welcome message for user:', member.first_name, 'to chat:', chat.id)
              await ctx.telegram.sendMessage(chat.id, message, { parse_mode: 'HTML' })
            }
          } catch (welcomeError) {
            console.error('Error sending welcome message:', welcomeError)
          }

          // Send notification to admin with @oLolsBot deep link
          try {
            console.log('Sending notification to admin for user:', member.id)

            // Build notification message with @oLolsBot deep link
            let notificationMessage = `🔍 <b>New User Joined</b>\n\n`
            notificationMessage += `<b>Chat:</b> ${chat.title || chat.id}\n`
            notificationMessage += `<b>User ID:</b> <code>${member.id}</code>\n`
            notificationMessage += `<b>Name:</b> ${member.first_name}`
            if (member.last_name) notificationMessage += ` ${member.last_name}`
            if (member.username) notificationMessage += ` (@${member.username})`
            notificationMessage += `\n\n🔗 <b>Check with @oLolsBot:</b>\n`
            notificationMessage += `https://t.me/oLolsBot?start=${member.id}`

            await ctx.telegram.sendMessage(ctx.config.adminId, notificationMessage, { parse_mode: 'HTML' })
            console.log('Notification sent to admin with @oLolsBot link')
          } catch (notificationError) {
            console.error('Error sending notification to admin:', notificationError)
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
