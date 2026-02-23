const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Xuất prisma để các file bot_taixiu.js, bot_cado.js... có thể dùng chung
global.prisma = prisma; 

// Import các hệ thống bot
require('./bot_cado.js');
require('./bot_taixiu.js');
require('./bot_shop.js');
require('./bot_lookup.js');
require('./bot_admin.js');
require('./bot_bxh.js');

console.log("🚀 Tất cả các hệ thống Bot đã được khởi động!");

// Xử lý khi tắt bot để ngắt kết nối database an toàn
process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit();
});
