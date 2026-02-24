import { Client, GatewayIntentBits, ActivityType } from 'discord.js';
import { config } from 'dotenv';

config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Bắt buộc để nhận lệnh !tx
        GatewayIntentBits.GuildMembers
    ]
});

// Xuất client để các file khác dùng chung
export default client;

// Nạp các module bot (Đảm bảo file tồn tại như trong ảnh image_43b225.png)
console.log('⏳ Đang khởi động các module...');
await import('./bot_cado.js');
await import('./bot_taixiu.js');
await import('./bot_admin.js');
await import('./bot_shop.js');
await import('./bot_bxh.js');

client.on('ready', () => {
    console.log(`✅ HỆ THỐNG ONLINE: ${client.user.tag}`);
    client.user.setActivity('🎲 !tx | ⚽ !keo', { type: ActivityType.Watching });
});

client.login(process.env.DISCORD_TOKEN);
