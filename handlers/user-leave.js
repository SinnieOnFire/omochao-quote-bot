const Composer = require('telegraf/composer')
const composer = new Composer()

composer.on('chat_member', async (ctx, next) => {
  try {
    const { chat, from, old_chat_member, new_chat_member } = ctx.update.chat_member
    
    // Check if user left the chat
    if (old_chat_member.status !== 'left' && old_chat_member.status !== 'kicked' && 
        (new_chat_member.status === 'left' || new_chat_member.status === 'kicked')) {
      
      // Send a message when user leaves
      const username = from.username ? `@${from.username}` : from.first_name
      const message = new_chat_member.status === 'kicked' 
        ? `Кто довыделывался? ${username}!` 
        : `Кто не выдержал нашего общества? ${username}!`
      
      await ctx.telegram.sendMessage(chat.id, message)
    }
  } catch (error) {
    console.error('Error in user leave handler:', error)
  }
  
  return next()
})

module.exports = composer