const Composer = require('telegraf/composer')
const composer = new Composer()

composer.use(async (ctx, next) => {
  console.log('User-leave handler checking update:', JSON.stringify(ctx.update, null, 2))
  
  // Check for chat_member updates where status changed to "left"
  if (ctx.update.chat_member) {
    const { chat_member } = ctx.update
    const oldStatus = chat_member.old_chat_member?.status
    const newStatus = chat_member.new_chat_member?.status
    
    // User left the chat
    if (oldStatus === 'member' && newStatus === 'left') {
      const user = chat_member.new_chat_member.user
      
      if (!user.is_bot) {
        const username = user.username ? `@${user.username}` : user.first_name
        const message = `Кто не выдержал нашего общества? ${username}!`
        
        console.log('Sending leave message for user:', username, 'to chat:', chat_member.chat.id)
        await ctx.telegram.sendMessage(chat_member.chat.id, message)
      }
    }
  }
  
  return next()
})

module.exports = composer