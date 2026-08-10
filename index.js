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
    console.log(`Total sum calculated: ${totalSum}`);
    updateEverything();
  } catch (err) {
    console.error('Error fetching messages:', err);
  }
}

async function updateChannelTopic(newValue) {
  try {
    // Only update if the number changed — prevents audit log spam
    if (newValue === lastTopicValue) {
      console.log(`Topic unchanged (${newValue}), skipping update`);
      return;
    }

    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      console.error('Cannot update topic — not a text channel');
      return;
    }

    await channel.edit({ 
      topic: `Total amount: ${newValue}` 
    });

    lastTopicValue = newValue;
    console.log(`Channel topic updated to: Total amount: ${newValue}`);
  } catch (err) {
    console.error('Error updating topic:', err.message);
  }
}

function updateEverything() {
  client.user.setPresence({
    status: 'online',
    activities: [{
      name: `Counting Seb's your mum jokes: ${totalSum}`,
      type: ActivityType.Watching
    }]
  });
  console.log(`Status updated → Total number: ${totalSum}`);

  // Also update channel topic (only if changed)
  updateChannelTopic(totalSum);
}

client.on('clientReady', async () => {
  console.log(`✅ ${client.user.tag} logged in`);
  await fetchCurrencySum();

  // Recount every 30 minutes as a safety net
  setInterval(fetchCurrencySum, 30 * 60 * 1000);
});

client.on('messageCreate', (message) => {
  if (message.channelId === CHANNEL_ID && !message.author.bot) {
    const added = sumCurrencyValues(message.content);
    if (added > 0) {
      totalSum += added;
      updateEverything();
      console.log(`Added ${added}, new total: ${totalSum}`);
    }
  }
});

client.on('messageDelete', (message) => {
  if (message.channelId === CHANNEL_ID) {
    const removed = sumCurrencyValues(message.content || '');
    if (removed > 0) {
      totalSum -= removed;
      updateEverything();
      console.log(`Removed ${removed}, new total: ${totalSum}`);
    }
  }
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled:', err);
});

client.login(TOKEN);