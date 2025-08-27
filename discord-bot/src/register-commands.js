import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [
  new SlashCommandBuilder()
    .setName('post-stage2')
    .setDescription('Post the Stage-2 watchlist to the Stage-2 channel')
    .addStringOption(o =>
      o.setName('url').setDescription('Optional JSON URL').setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('post-briefing')
    .setDescription('Post a daily briefing link (and optional summary)')
    .addStringOption(o => o.setName('url').setDescription('URL').setRequired(true))
    .addStringOption(o => o.setName('summary').setDescription('Short summary').setRequired(false)),
  new SlashCommandBuilder()
    .setName('post-playbook')
    .setDescription('Post a weekly playbook link (and optional summary)')
    .addStringOption(o => o.setName('url').setDescription('URL').setRequired(true))
    .addStringOption(o => o.setName('summary').setDescription('Short summary').setRequired(false)),
  new SlashCommandBuilder().setName('ping').setDescription('Health check')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.DISCORD_CLIENT_ID,
        process.env.DISCORD_GUILD_ID
      ),
      { body: commands }
    );
    console.log('Slash commands registered.');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
