const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Hàm lấy số dư: Nếu chưa có thì tạo mới với 5000
async function getBalance(userId) {
    const user = await prisma.user.upsert({
        where: { discordId: userId },
        update: {}, // Không thay đổi gì nếu đã tồn tại
        create: { discordId: userId, balance: 5000 } // Tạo mới nếu chưa có
    });
    return user.balance;
}

// Hàm cập nhật số dư: Dùng upsert để tránh lỗi "Không tìm thấy người dùng"
async function updateBalance(userId, amount) {
    return await prisma.user.upsert({
        where: { discordId: userId },
        update: { 
            balance: { increment: amount } 
        },
        create: { 
            discordId: userId, 
            balance: 5000 + amount // Nếu nạp lần đầu thì tặng 5k gốc + số tiền nạp
        }
    });
}

module.exports = { getBalance, updateBalance, prisma };
