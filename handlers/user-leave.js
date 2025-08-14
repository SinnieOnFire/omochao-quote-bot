const Composer = require('telegraf/composer')
const composer = new Composer()

composer.use(async (ctx, next) => {
  // Check for left_chat_member in regular message updates
  if (ctx.update.message && ctx.update.message.left_chat_member) {
    try {
      const { chat, left_chat_member } = ctx.update.message
      
      // Don't send message if a bot left
      if (!left_chat_member.is_bot) {
        const username = left_chat_member.username ? `@${left_chat_member.username}` : left_chat_member.first_name
        const message = `Кто не выдержал нашего общества? ${username}!`
        
        await ctx.telegram.sendMessage(chat.id, message)
      }
    } catch (error) {
      console.error('Error in user leave handler:', error)
    }
  }
  
  return next()
})

module.exports = composer