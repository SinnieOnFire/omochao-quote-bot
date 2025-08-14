const Composer = require('telegraf/composer')
const composer = new Composer()

composer.use(async (ctx, next) => {
  console.log('Update received, type:', Object.keys(ctx.update))
  
  if (ctx.update.chat_member) {
    console.log('Chat member update received:', JSON.stringify(ctx.update.chat_member, null, 2))
    
    try {
      const { chat, from, old_chat_member, new_chat_member } = ctx.update.chat_member
      
      console.log(`User ${from.first_name} status change: ${old_chat_member.status} -> ${new_chat_member.status}`)
      
      // Check if user left the chat
      if (old_chat_member.status !== 'left' && old_chat_member.status !== 'kicked' && 
          (new_chat_member.status === 'left' || new_chat_member.status === 'kicked')) {
        
        console.log('User left detected, sending message...')
        
        // Send a message when user leaves
        const username = from.username ? `@${from.username}` : from.first_name
        const message = new_chat_member.status === 'kicked' 
          ? `Кто довыделывался? ${username}!` 
          : `Кто не выдержал нашего общества? ${username}!`
        
        await ctx.telegram.sendMessage(chat.id, message)
        console.log('Leave message sent successfully')
      }
    } catch (error) {
      console.error('Error in user leave handler:', error)
    }
  }
  
  return next()
})

module.exports = composer