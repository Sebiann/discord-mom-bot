require('dotenv').config();
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');

const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

// Match "+ 5" and capture the number 5 (allows space between + and number)
const CURRENCY_PATTERN = /\+\s*(\d+)/gi;

function sumCurrencyValues(text) {
  const matches = text.match(CURRENCY_PATTERN);
  if (!matches) return 0;

  let sum = 0;
  for (const match of matches) {
    const num = parseInt(match.replace(/\D/g, ''), 10);
    if (!isNaN(num)) sum += num;
  }
  return sum;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let totalSum = 0;
let lastTopicValue = null;
let topicUpdateInFlight = false;
let pendingTopicValue = null;

function timestamp() {
  return new Date().toISOString();
}

function log(message) {
  console.log(`[${timestamp()}] ${message}`);
}

function logError(message, err) {
  if (err) {
    console.error(`[${timestamp()}] ${message}`, err);
    return;
  }

  console.error(`[${timestamp()}] ${message}`);
}

function buildTopicText(value) {
  return `Total amount: ${value} | Updated: ${timestamp()}`;
}

async function fetchCurrencySum() {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      console.error('Channel not found or not a text channel');
      return;
    }

    let sum = 0;
    let lastId = undefined;

    while (true) {
      const messages = await channel.messages.fetch({
        limit: 100,
        before: lastId,
      });

      if (messages.size === 0) break;

      messages.forEach(msg => {
        if (!msg.author.bot) {
          sum += sumCurrencyValues(msg.content);
        }
      });

      lastId = messages.last().id;
    }

    totalSum = sum;
    log(`Total sum calculated: ${totalSum}`);
    await updateEverything();
  } catch (err) {
    logError('Error fetching messages:', err);
  }
}

async function updateChannelTopic(newValue) {
  pendingTopicValue = newValue;

  if (topicUpdateInFlight) {
    return;
  }

  topicUpdateInFlight = true;

  try {
    while (pendingTopicValue !== null) {
      const nextValue = pendingTopicValue;
      pendingTopicValue = null;

      // Only update if the number changed - prevents audit log spam
      if (nextValue === lastTopicValue) {
        log(`Topic unchanged (${nextValue}), skipping update`);
        continue;
      }

      const channel = await client.channels.fetch(CHANNEL_ID);
      if (!channel || !channel.isTextBased()) {
        logError('Cannot update topic - not a text channel');
        return;
      }

      const topicText = buildTopicText(nextValue);

      await channel.edit({
        topic: topicText
      });

      lastTopicValue = nextValue;
      log(`Channel topic updated to: ${topicText}`);
    }
  } catch (err) {
    logError('Error updating topic:', err.message);
  } finally {
    topicUpdateInFlight = false;
  }
}

async function updateEverything() {
  client.user.setPresence({
    status: 'online',
    activities: [{
      name: `Counting Seb's your mum jokes: ${totalSum}`,
      type: ActivityType.Watching
    }]
  });
  log(`Status updated -> Total number: ${totalSum}`);

  // Also update channel topic (only if changed)
  await updateChannelTopic(totalSum);
}

client.on('clientReady', async () => {
  log(`${client.user.tag} logged in`);
  await fetchCurrencySum();

  // Recount every 30 minutes as a safety net
  setInterval(fetchCurrencySum, 30 * 60 * 1000);
});

client.on('messageCreate', (message) => {
  if (message.channelId === CHANNEL_ID && !message.author.bot) {
    (async () => {
      const added = sumCurrencyValues(message.content);
      if (added > 0) {
        totalSum += added;
        await updateEverything();
        log(`Added ${added}, new total: ${totalSum}`);
      }
    })().catch(err => logError('Error handling messageCreate:', err));
  }
});

client.on('messageDelete', (message) => {
  if (message.channelId === CHANNEL_ID) {
    (async () => {
      const removed = sumCurrencyValues(message.content || '');
      if (removed > 0) {
        totalSum -= removed;
        await updateEverything();
        log(`Removed ${removed}, new total: ${totalSum}`);
      }
    })().catch(err => logError('Error handling messageDelete:', err));
  }
});

process.on('unhandledRejection', (err) => {
  logError('Unhandled:', err);
});

client.login(TOKEN);