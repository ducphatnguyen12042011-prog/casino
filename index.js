import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { config } from 'dotenv';
import { prisma } from './shared/economy.js'; // Đảm bảo đường dẫn đúng

// Khởi tạo biến môi trường từ file .env
config();

// 1. Khởi tạo Client với đầy đủ Intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // BẮT BUỘC để đọc lệnh !tx, !keo
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

// 2. Chia sẻ client cho các module khác
// Lưu ý: Trong các file như bot_cado.js, bạn sẽ không tạo 'new Client' nữa 
// mà xuất (export) một hàm nhận client làm tham số.
export default client; 

// 3. Import các Module (Hãy đảm bảo các file này tồn tại)
import './bot_cado.js';    // Bot cá độ (Bản API Football bạn vừa có)
import './bot_taixiu.js';  // Bot tài xỉu
import './bot_shop.js';    // Bot cửa hàng (nếu có)

// 4. Sự kiện khi Bot sẵn sàng
client.on('ready', () => {
    console.log('====================================');
    console.log(`✅ VERDICT SYSTEM CORE ONLINE`);
    console.log(`🤖 Logged in as: ${client.user.tag}`);
    console.log(`📡 Intents: MessageContent is ACTIVE`);
    console.log('====================================');
    
    // Set trạng thái cho bot
    client.user.setActivity('💰 !keo | !tx', { type: 3 }); // Type 3 là "Watching"
});

// 5. Xử lý lỗi toàn cục để bot không bị văng (Crash)
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Lỗi chưa xử lý tại:', promise, 'Lý do:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Lỗi hệ thống nghiêm trọng:', err);
});

// 6. Đăng nhập
client.login(process.env.DISCORD_TOKEN);
