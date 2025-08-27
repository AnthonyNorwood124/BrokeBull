import 'dotenv/config';
import fetch from 'node-fetch';
import cron from 'node-cron';
import {
  Client, GatewayIntentBits, EmbedBuilder, time, inlineCode, ChannelType
} from 'discord.js';

const {
  DISCORD_TOKEN,
  STAGE2_CHANNEL_ID,
  BRIEFING_CHANNEL_ID,
  PLAYBOOK_CHANNEL_ID,
  STAGE2_JSON_URL,
  ENABLE_CRON = 'false',
  CRON_TZ = 'America/New_York',
  CRON_STAGE2 = '0 9 * * 1-5',
  ADMIN_USER_IDS = ''
} = process.env;

const ADMIN_SET = new Set(ADMIN_USER_IDS.split(',').map(x => x.trim()).filter(Boolean));
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  if (ENABLE_CRON === 'true') {
    cron.schedule(CRON_STAGE2, async () => {
      try { await postStage2(); } catch (e) { console.error('Scheduled Stage-2 post failed:', e); }
    }, { timezone: CRON_TZ });
    console.log(`Cron enabled: ${CRON_STAGE2} (${CRON_TZ})`);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'ping') {
      await interaction.reply({ content: '🏓 alive', ephemeral: true });
      return;
    }

    if (!ADMIN_SET.has(interaction.user.id)) {
      await interaction.reply({ content: 'This command is restricted.', ephemeral: true });
      return;
    }

    if (interaction.commandName === 'post-stage2') {
      await interaction.deferReply({ ephemeral: true });
      const url = interaction.options.getString('url') || STAGE2_JSON_URL;
      await postStage2(url);
      await interaction.editReply('Stage-2 watchlist posted ✅');
      return;
    }

    if (interaction.commandName === 'post-briefing') {
      await interaction.deferReply({ ephemeral: true });
      const url = interaction.options.getString('url');
      const summary = interaction.options.getString('summary') || '';
      await postLink(BRIEFING_CHANNEL_ID, 'Daily Briefing', url, summary);
      await interaction.editReply('Briefing posted ✅');
      return;
    }

    if (interaction.commandName === 'post-playbook') {
      await interaction.deferReply({ ephemeral: true });
      const url = interaction.options.getString('url');
      const summary = interaction.options.getString('summary') || '';
      await postLink(PLAYBOOK_CHANNEL_ID, 'Weekly Playbook', url, summary);
      await interaction.editReply('Playbook posted ✅');
      return;
    }
  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply('Something went sideways. Check logs.');
    } else {
      await interaction.reply({ content: 'Something went sideways. Check logs.', ephemeral: true });
    }
  }
});

/* ---------------- Helpers ---------------- */

async function postStage2(url = STAGE2_JSON_URL) {
  const ch = await client.channels.fetch(STAGE2_CHANNEL_ID);
  if (!ch || ch.type !== ChannelType.GuildText) throw new Error('Stage-2 channel not found');

  const rows = await fetchStage2(url);
  const embeds = buildStage2Embeds(rows);

  const header = new EmbedBuilder()
    .setTitle('Stage-2 Watchlist')
    .setDescription(`Auto-posted ${time(new Date(), 'D')} • Source: ${inlineCode(url)}`)
    .setColor(0x6c2eb8);

  await ch.send({ embeds: [header] });
  for (const em of embeds) await ch.send({ embeds: [em] });
}

async function fetchStage2(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const data = await res.json();
  const items = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
  return items.map(x => ({
    symbol: x.symbol?.toUpperCase() || '—',
    setup: x.setup || x.thesis || '—',
    entry: x.entry ?? '—',
    stop: x.stop ?? '—',
    target: x.target ?? '—',
    status: x.status || 'Watch',
    updated: x.updated || ''
  }));
}

function buildStage2Embeds(rows) {
  const chunk = (arr, n) => arr.length ? [arr.slice(0, n), ...chunk(arr.slice(n), n)] : [];
  const chunks = chunk(rows, 8);
  return chunks.map((group, idx) => {
    const desc = group.map(r =>
      `**${r.symbol}** — ${r.setup}\n` +
      `Entry: ${r.entry} • Stop: ${r.stop} • Target: ${r.target} • ` +
      `Status: \`${r.status}\`${r.updated ? ` • Updated: ${r.updated}` : ''}`
    ).join('\n\n');
    return new EmbedBuilder()
      .setTitle(idx === 0 ? 'Symbols' : `Symbols (cont.)`)
      .setDescription(desc)
      .setColor(0x6c2eb8);
  });
}

async function postLink(channelId, title, url, summary = '') {
  const ch = await client.channels.fetch(channelId);
  if (!ch || ch.type !== ChannelType.GuildText) throw new Error('Channel not found');
  const em = new EmbedBuilder().setTitle(title).setURL(url).setDescription(summary?.slice(0, 1800) || '').setColor(0x6c2eb8);
  await ch.send({ embeds: [em] });
}

/* ---------------- Boot ---------------- */
client.login(DISCORD_TOKEN);
