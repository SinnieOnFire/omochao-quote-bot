const Composer = require('telegraf/composer')
const composer = new Composer()

// Store pending queries to @oLolsBot
// Format: { userId: { username: string, timestamp: number, chatTitle: string } }
const pendingQueries = new Map()

// Timeout for pending queries (5 minutes)
const QUERY_TIMEOUT = 5 * 60 * 1000

// Add a query to the pending list
composer.addPendingQuery = (userId, username, chatTitle) => {
  pendingQueries.set(userId, {
    username: username || null,
    timestamp: Date.now(),
    chatTitle: chatTitle
  })
  console.log(`Added pending query for user ${userId} (${username || 'no username'})`)

  // Clean up old queries periodically
  cleanupOldQueries()
}

// Clean up queries older than QUERY_TIMEOUT
function cleanupOldQueries() {
  const now = Date.now()
  for (const [userId, data] of pendingQueries.entries()) {
    if (now - data.timestamp > QUERY_TIMEOUT) {
      console.log(`Removing stale query for user ${userId}`)
      pendingQueries.delete(userId)
    }
  }
}

// Handler to capture messages from @oLolsBot and forward to @sinnie
composer.use(async (ctx, next) => {
  try {
    // Check if message is from @oLolsBot (username: ololsbot)
    if (ctx.message && ctx.message.from && ctx.message.from.username === 'ololsbot') {
      console.log('Received response from @oLolsBot')

      // Try to extract user_id from the response
      // @oLolsBot responses typically contain "user_id: XXXXXXX" in the message
      const messageText = ctx.message.text || ctx.message.caption || ''
      const userIdMatch = messageText.match(/user_id[:\s]+(\d+)/)

      if (userIdMatch) {
        const userId = userIdMatch[1]
        console.log(`Extracted user ID from @oLolsBot response: ${userId}`)

        // Check if this is a response to one of our queries
        if (pendingQueries.has(userId)) {
          console.log(`Matched response to pending query for user ${userId}`)

          // Remove from pending queries
          pendingQueries.delete(userId)

          // Forward the entire message to admin
          try {
            await ctx.telegram.forwardMessage(ctx.config.adminId, ctx.message.chat.id, ctx.message.message_id)
            console.log('Forwarded @oLolsBot response to admin')
          } catch (forwardError) {
            console.error('Error forwarding message to admin:', forwardError)

            // If forwarding fails, try sending the text content
            if (messageText) {
              await ctx.telegram.sendMessage(ctx.config.adminId,
                `📨 <b>Response from @oLolsBot:</b>\n\n${messageText}`,
                { parse_mode: 'HTML' }
              )
            }
          }
        } else {
          console.log(`Response for user ${userId} not in pending queries - ignoring`)
        }
      } else {
        console.log('Could not extract user_id from @oLolsBot response - ignoring')
      }
    }
  } catch (error) {
    console.error('Error in @oLolsBot response handler:', error)
  }

  return next()
})

module.exports = composer
