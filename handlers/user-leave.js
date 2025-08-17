const Composer = require('telegraf/composer')
const composer = new Composer()

composer.use(async (ctx, next) => {
  // Log all updates to see what we're receiving
  console.log('User-leave handler checking update:', JSON.stringify(ctx.update, null, 2))
  
  // Check for left_chat_member in regular message updates
  if (ctx.update.message && ctx.update.message.left_chat_member) {
    console.log('User left detected:', ctx.update.message.left_chat_member)
    try {
      const { chat, left_chat_member } = ctx.update.message
      
      // Don't send message if a bot left
      if (!left_chat_member.is_bot) {
        const username = left_chat_member.username ? `@${left_chat_member.username}` : left_chat_member.first_name
        const message = `Кто не выдержал нашего общества? ${username}!`
        
        console.log('Sending leave message for user:', username, 'to chat:', chat.id)
        await ctx.telegram.sendMessage(chat.id, message)
      } else {
        console.log('Bot left, not sending message')
      }
    } catch (error) {
      console.error('Error in user leave handler:', error)
    }
  }
  
  return next()
})

module.exports = composer