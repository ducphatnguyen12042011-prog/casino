import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

config(); // Nạp biến môi trường từ file .env

// Khởi tạo PrismaClient và truyền URL trực tiếp để tránh lỗi P1012 trên Prisma 7
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
});

/**
 * Hàm lấy số dư: Nếu chưa có thì tạo mới với 5000
 * @param {string} userId - ID Discord của người dùng
 */
async function getBalance(userId) {
    try {
        const user = await prisma.user.upsert({
            where: { discordId: userId },
            update: {}, // Không thay đổi gì nếu đã tồn tại
            create: { discordId: userId, balance: 5000 } // Tặng 5000 cho người mới
        });
        return user.balance;
    } catch (error) {
        console.error(`❌ Lỗi getBalance cho ${userId}:`, error);
        return 0;
    }
}

/**
 * Hàm cập nhật số dư: Dùng upsert để đảm bảo người dùng luôn tồn tại
 * @param {string} userId - ID Discord của người dùng
 * @param {number} amount - Số tiền cộng thêm (âm nếu trừ tiền)
 */
async function updateBalance(userId, amount) {
    try {
        return await prisma.user.upsert({
            where: { discordId: userId },
            update: { 
                balance: { increment: amount } 
            },
            create: { 
                discordId: userId, 
                balance: 5000 + amount // Tặng 5k gốc + số tiền thay đổi
            }
        });
    } catch (error) {
        console.error(`❌ Lỗi updateBalance cho ${userId}:`, error);
        throw error;
    }
}

// Export theo chuẩn ES Modules
export { getBalance, updateBalance, prisma };
