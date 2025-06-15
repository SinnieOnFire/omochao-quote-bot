const fs = require('fs')
const path = require('path')

const MESSAGES_FILE = '/app/data/rockyball-messages.json'
const QUEUE_FILE = '/app/data/rockyball-queue.json'

async function ensureDataDirExists() {
  const dataDir = '/app/data'
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
}

function getMessages() {
  if (!fs.existsSync(MESSAGES_FILE)) {
    return {}
  }
  try {
    return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function saveMessages(messages) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2))
}

function getQueue() {
  if (!fs.existsSync(QUEUE_FILE)) {
    return { used: [], available: [] }
  }
  try {
    return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'))
  } catch {
    return { used: [], available: [] }
  }
}

function saveQueue(queue) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2))
}

function updateMessageQueue() {
  const messages = getMessages()
  const messageIds = Object.keys(messages)
  const queue = getQueue()
  
  const newMessages = messageIds.filter(id => 
    !queue.used.includes(id) && !queue.available.includes(id)
  )
  
  queue.available.push(...newMessages)
  
  if (queue.available.length === 0 && queue.used.length > 0) {
    queue.available = [...queue.used]
    queue.used = []
  }
  
  saveQueue(queue)
  return queue
}

function getRandomMessage() {
  const queue = updateMessageQueue()
  
  if (queue.available.length === 0) {
    return null
  }
  
  const randomIndex = Math.floor(Math.random() * queue.available.length)
  const selectedMessageId = queue.available[randomIndex]
  
  queue.available.splice(randomIndex, 1)
  queue.used.push(selectedMessageId)
  
  saveQueue(queue)
  
  const messages = getMessages()
  return messages[selectedMessageId]
}

async function saveMessageData(ctx, message) {
  await ensureDataDirExists()
  
  const hasImage = message.photo || 
    (message.document && message.document.mime_type && 
     message.document.mime_type.startsWith('image/'))
  
  if (!hasImage) {
    return false
  }
  
  try {
    const messages = getMessages()
    const messageId = `${message.chat.id}_${message.message_id}_${Date.now()}`
    
    const messageData = {
      chat_id: message.chat.id,
      message_id: message.message_id,
      from: message.from,
      date: message.date,
      photo: message.photo,
      document: message.document,
      caption: message.caption,
      saved_at: Date.now(),
      saved_by: ctx.from.id
    }
    
    messages[messageId] = messageData
    saveMessages(messages)
    updateMessageQueue()
    
    return messageId
  } catch (error) {
    console.error('Ошибка сохранения сообщения:', error)
    return false
  }
}

function deleteMessage(messageId) {
  try {
    const messages = getMessages()
    
    if (messages[messageId]) {
      delete messages[messageId]
      saveMessages(messages)
      
      const queue = getQueue()
      queue.available = queue.available.filter(id => id !== messageId)
      queue.used = queue.used.filter(id => id !== messageId)
      saveQueue(queue)
      
      return true
    }
    return false
  } catch (error) {
    console.error('Ошибка удаления сообщения:', error)
    return false
  }
}

async function importForwardedMessage(ctx, forwardedMessage) {
  try {
    await ensureDataDirExists()
    
    const messageText = forwardedMessage.text || forwardedMessage.caption || ''
    
    if (!messageText.toLowerCase().includes('рокк ебол')) {
      return false
    }
    
    const hasImage = forwardedMessage.photo || 
      (forwardedMessage.document && forwardedMessage.document.mime_type && 
       forwardedMessage.document.mime_type.startsWith('image/'))
    
    if (!hasImage) {
      return false
    }
    
    const messageId = `${forwardedMessage.forward_from_chat?.id || forwardedMessage.chat.id}_${forwardedMessage.forward_from_message_id || forwardedMessage.message_id}_imported_${Date.now()}`
    const existingMessages = getMessages()
    
    if (existingMessages[messageId]) {
      return false
    }
    
    const messageData = {
      chat_id: forwardedMessage.forward_from_chat?.id || forwardedMessage.chat.id,
      message_id: forwardedMessage.forward_from_message_id || forwardedMessage.message_id,
      from: forwardedMessage.forward_from || forwardedMessage.from,
      date: forwardedMessage.forward_date || forwardedMessage.date,
      photo: forwardedMessage.photo,
      document: forwardedMessage.document,
      caption: messageText,
      saved_at: Date.now(),
      saved_by: ctx.from.id,
      imported: true,
      original_chat_id: forwardedMessage.forward_from_chat?.id,
      original_message_id: forwardedMessage.forward_from_message_id
    }
    
    existingMessages[messageId] = messageData
    saveMessages(existingMessages)
    updateMessageQueue()
    
    return messageId
  } catch (error) {
    console.error('Ошибка импорта пересланного сообщения:', error)
    return false
  }
}

module.exports = async (ctx) => {
  const messageText = ctx.message.text || ctx.message.caption || ''
  
  // Check for import command
  if (messageText.toLowerCase().startsWith('/import_rockyball')) {
    await ctx.reply('Для импорта исторических сообщений с рокк еболом:\n1. Перейдите в чат -1002140477919\n2. Найдите сообщения с "рокк ебол" и картинками\n3. Переслать их в этот чат\n4. Затем отправьте /save_as_original для сохранения последнего пересланного сообщения как оригинального')
    return
  }
  
  // Manual save forwarded message as original
  if (messageText.toLowerCase().startsWith('/save_as_original')) {
    if (ctx.message.reply_to_message) {
      const replyMsg = ctx.message.reply_to_message
      const hasImage = replyMsg.photo || (replyMsg.document && replyMsg.document.mime_type?.startsWith('image/'))
      const msgText = replyMsg.text || replyMsg.caption || ''
      
      if (hasImage && msgText.toLowerCase().includes('рокк ебол')) {
        const messageId = `original_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        const messages = getMessages()
        
        const messageData = {
          chat_id: -1002140477919, // Force original chat ID
          message_id: Math.floor(Math.random() * 1000000), // Random original message ID
          from: { id: 0, first_name: "Imported User", username: "imported" }, // Placeholder user
          date: replyMsg.date,
          photo: replyMsg.photo,
          document: replyMsg.document,
          caption: msgText,
          saved_at: Date.now(),
          saved_by: ctx.from.id,
          imported: true
        }
        
        messages[messageId] = messageData
        saveMessages(messages)
        updateMessageQueue()
        
        await ctx.reply('Рокк ебол! Сообщение сохранено как оригинальное из чата -1002140477919!')
      } else {
        await ctx.reply('Ответьте на сообщение с картинкой и "рокк ебол"')
      }
    } else {
      await ctx.reply('Ответьте этой командой на пересланное сообщение')
    }
    return
  }
  
  // Check for forwarded messages
  if (ctx.message.forward_from_chat || ctx.message.forward_from) {
    const targetChatId = -1002140477919
    const forwardedFromChat = ctx.message.forward_from_chat?.id
    
    if (forwardedFromChat === targetChatId) {
      const importedId = await importForwardedMessage(ctx, ctx.message)
      if (importedId) {
        await ctx.reply('Рокк ебол! Историческое сообщение импортировано!')
      }
      return
    }
  }
  
  if (!messageText.toLowerCase().includes('рокк ебол')) {
    return
  }
  
  const hasImage = ctx.message.photo || 
    (ctx.message.document && ctx.message.document.mime_type && 
     ctx.message.document.mime_type.startsWith('image/'))
  
  if (hasImage) {
    const messageId = await saveMessageData(ctx, ctx.message)
    if (messageId) {
      const confirmMsg = await ctx.reply('Рокк ебол! Картинка сохранена. Напиши в ответ «delete» чтобы удалить её.', {
        reply_to_message_id: ctx.message.message_id,
        allow_sending_without_reply: true
      })
      
      const deleteTimeout = setTimeout(async () => {
        try {
          await ctx.deleteMessage(confirmMsg.message_id)
        } catch (error) {
          console.log('Не удалось удалить сообщение подтверждения')
        }
      }, 30000)
      
      global.rockyballPendingDeletes = global.rockyballPendingDeletes || new Map()
      global.rockyballPendingDeletes.set(confirmMsg.message_id, {
        messageId,
        timeout: deleteTimeout,
        chatId: ctx.chat.id,
        userId: ctx.from.id
      })
    }
  } else {
    const randomMessageData = getRandomMessage()
    
    if (randomMessageData) {
      try {
        if (randomMessageData.photo) {
          await ctx.replyWithPhoto(randomMessageData.photo[randomMessageData.photo.length - 1].file_id, {
            reply_to_message_id: ctx.message.message_id,
            allow_sending_without_reply: true,
            caption: randomMessageData.caption
          })
        } else if (randomMessageData.document) {
          await ctx.replyWithDocument(randomMessageData.document.file_id, {
            reply_to_message_id: ctx.message.message_id,
            allow_sending_without_reply: true,
            caption: randomMessageData.caption
          })
        }
      } catch (error) {
        console.error('Ошибка отправки картинки:', error)
        await ctx.reply('Нет доступных картинок!', {
          reply_to_message_id: ctx.message.message_id,
          allow_sending_without_reply: true
        })
      }
    } else {
      await ctx.reply('Нет доступных картинок!', {
        reply_to_message_id: ctx.message.message_id,
        allow_sending_without_reply: true
      })
    }
  }
  
  // Only process delete if it's a reply to a confirmation message AND contains "delete"
  if (ctx.message.reply_to_message && messageText.toLowerCase().trim() === 'delete') {
    const replyToId = ctx.message.reply_to_message.message_id
    const pendingDeletes = global.rockyballPendingDeletes || new Map()
    
    // Only proceed if this is a reply to a tracked confirmation message
    if (pendingDeletes.has(replyToId)) {
      const deleteInfo = pendingDeletes.get(replyToId)
      
      if (deleteInfo.userId === ctx.from.id && deleteInfo.chatId === ctx.chat.id) {
        const deleted = deleteMessage(deleteInfo.messageId)
        
        if (deleted) {
          await ctx.reply('Рокк ебол! Картинка удалена.', {
            reply_to_message_id: ctx.message.message_id,
            allow_sending_without_reply: true
          })
          
          try {
            await ctx.deleteMessage(replyToId)
          } catch (error) {
            console.log('Не удалось удалить сообщение')
          }
        } else {
          await ctx.reply('Не удалось удалить картинку', {
            reply_to_message_id: ctx.message.message_id,
            allow_sending_without_reply: true
          })
        }
        
        clearTimeout(deleteInfo.timeout)
        pendingDeletes.delete(replyToId)
      }
    }
  }
}