// shared/economy.js
import { PrismaClient } from '@prisma/client';

// Khởi tạo Prisma và truyền URL từ Railway hệ thống
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

export async function getBalance(userId) {
  try {
    const user = await prisma.user.upsert({
      where: { discordId: userId },
      update: {},
      create: { discordId: userId, balance: 5000 }
    });
    return user.balance;
  } catch (error) {
    console.error("❌ Lỗi Ví:", error);
    return 0;
  }
}

export async function updateBalance(userId, amount) {
  try {
    return await prisma.user.upsert({
      where: { discordId: userId },
      update: { balance: { increment: amount } },
      create: { discordId: userId, balance: 5000 + amount }
    });
  } catch (error) {
    console.error("❌ Lỗi cập nhật Ví:", error);
    throw error;
  }
}
