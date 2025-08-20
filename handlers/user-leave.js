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
  
  // Check for chat_member_updated events (for admins leaving)
  if (ctx.update.chat_member_updated) {
    const { new_chat_member, old_chat_member, chat } = ctx.update.chat_member_updated
    
    // Check if user status changed to "left"
    if (new_chat_member && new_chat_member.status === 'left' && 
        old_chat_member && old_chat_member.status !== 'left') {
      console.log('Admin/user left detected via chat_member_updated:', new_chat_member.user)
      
      try {
        const leftUser = new_chat_member.user
        // Don't send message if a bot left
        if (!leftUser.is_bot) {
          const username = leftUser.username ? `@${leftUser.username}` : leftUser.first_name
          const message = `Кто не выдержал нашего общества? ${username}!`
          
          console.log('Sending leave message for user:', username, 'to chat:', chat.id)
          await ctx.telegram.sendMessage(chat.id, message)
        } else {
          console.log('Bot left, not sending message')
        }
      } catch (error) {
        console.error('Error in chat_member_updated handler:', error)
      }
    }
  }
  
  return next()
})

module.exports = composer