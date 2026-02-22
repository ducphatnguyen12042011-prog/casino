const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getBalance(userId) {
    let user = await prisma.user.findUnique({ where: { discordId: userId } });
    if (!user) user = await prisma.user.create({ data: { discordId: userId, balance: 5000 } });
    return user.balance;
}

async function updateBalance(userId, amount) {
    return await prisma.user.update({
        where: { discordId: userId },
        data: { balance: { increment: amount } }
    });
}

module.exports = { getBalance, updateBalance };
