const Composer = require('telegraf/composer')
const composer = new Composer()

const DEBUG_USER_LEAVE = process.env.DEBUG_USER_LEAVE === 'true'

composer.use(async (ctx, next) => {
  if (DEBUG_USER_LEAVE) {
    console.log('User-leave handler checking update:', JSON.stringify(ctx.update, null, 2))
  }

  // Fallback for small chats where bot is not admin
  if (ctx.update.message && ctx.update.message.left_chat_member) {
    const user = ctx.update.message.left_chat_member

    if (!user.is_bot) {
      const username = user.username ? `@${user.username}` : user.first_name
      const message = `Кто не выдержал нашего общества? ${username}!`

      try {
        console.log('Sending leave message for user:', username, 'to chat:', ctx.update.message.chat.id)
        await ctx.telegram.sendMessage(ctx.update.message.chat.id, message)
      } catch (error) {
        console.error('Error in left_chat_member handler:', error)
      }
    }
  }

  // Check for chat_member updates
  // Docs: https://core.telegram.org/bots/api#chatmemberupdated
  // Status values: 'creator'/'owner', 'administrator', 'member', 'restricted', 'left', 'kicked'/'banned'
  if (ctx.update.chat_member) {
    const { chat_member } = ctx.update
    const oldStatus = chat_member.old_chat_member?.status
    const newStatus = chat_member.new_chat_member?.status
    const oldIsMember = chat_member.old_chat_member?.is_member
    const newIsMember = chat_member.new_chat_member?.is_member
    const oldCanSend = chat_member.old_chat_member?.can_send_messages
    const newCanSend = chat_member.new_chat_member?.can_send_messages
    const user = chat_member.new_chat_member?.user

    // Determine membership based on status (per Telegram Bot API docs)
    // is_member field only exists for 'restricted' status, so check status first
    const MEMBER_STATUSES = ['creator', 'administrator', 'member']
    const wasMember = MEMBER_STATUSES.includes(oldStatus) ||
                      (oldStatus === 'restricted' && oldIsMember === true)
    const isMember = MEMBER_STATUSES.includes(newStatus) ||
                     (newStatus === 'restricted' && newIsMember === true)

    if (user && !user.is_bot) {
      const username = user.username ? `@${user.username}` : user.first_name

      if (DEBUG_USER_LEAVE) {
        console.log('chat_member update:', { oldStatus, newStatus, wasMember, isMember, oldIsMember, newIsMember })
      }

      try {
        // User was banned/kicked
        if (newStatus === 'kicked') {
          const message = `Кого не выдержало наше общество? ${username}!`
          console.log('Sending ban message for user:', username, 'to chat:', chat_member.chat.id)
          await ctx.telegram.sendMessage(chat_member.chat.id, message)
        }
        // User left voluntarily (was a member before, now not a member)
        else if (wasMember && !isMember && newStatus === 'left') {
          const message = `Кто не выдержал нашего общества? ${username}!`
          console.log('Sending leave message for user:', username, 'to chat:', chat_member.chat.id)
          await ctx.telegram.sendMessage(chat_member.chat.id, message)
        }
        // User was muted (can_send_messages became false)
        else if (newCanSend === false && oldCanSend !== false) {
          const message = `${username} отправляется в доброрум!`
          console.log('Sending restriction message for user:', username, 'to chat:', chat_member.chat.id)
          await ctx.telegram.sendMessage(chat_member.chat.id, message)
        }
      } catch (error) {
        console.error('Error in chat_member handler:', error)
      }
    }
  }

  return next()
})

module.exports = composer
