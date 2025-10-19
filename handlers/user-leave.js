const Composer = require('telegraf/composer')
const composer = new Composer()

composer.use(async (ctx, next) => {
  console.log('User-leave handler checking update:', JSON.stringify(ctx.update, null, 2))
  
  // Check for message with left_chat_member
  if (ctx.update.message && ctx.update.message.left_chat_member) {
    const user = ctx.update.message.left_chat_member
    
    if (!user.is_bot) {
      const username = user.username ? `@${user.username}` : user.first_name
      const message = `Кто не выдержал нашего общества? ${username}!`
      
      console.log('Sending leave message for user:', username, 'to chat:', ctx.update.message.chat.id)
      await ctx.telegram.sendMessage(ctx.update.message.chat.id, message)
    }
  }
  
  // Check for chat_member updates where status changed to "left" or "kicked"
  if (ctx.update.chat_member) {
    const { chat_member } = ctx.update
    const oldStatus = chat_member.old_chat_member?.status
    const newStatus = chat_member.new_chat_member?.status
    
    // User left the chat or was kicked/banned
    if ((oldStatus === 'member' || oldStatus === 'restricted') && (newStatus === 'left' || newStatus === 'kicked')) {
      const user = chat_member.new_chat_member.user
      
      if (!user.is_bot) {
        const username = user.username ? `@${user.username}` : user.first_name
        let message = `Кто не выдержал нашего общества? ${username}!`
        
        // Different message for kicked/banned users
        if (newStatus === 'kicked') {
          message = `Кого не выдержало наше общество? ${username}!`
        }
        
        console.log('Sending leave message for user:', username, 'to chat:', chat_member.chat.id)
        await ctx.telegram.sendMessage(chat_member.chat.id, message)
      }
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