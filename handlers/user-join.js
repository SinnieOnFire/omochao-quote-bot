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
