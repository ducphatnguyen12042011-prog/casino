const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { updateBalance, getBalance, prisma } = require('./shared/economy');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const ADMIN_ROLE_ID = "1465374336214106237"; 
const LOG_CHANNEL_ID = "1475501156267462676"; 
const CURRENCY_NAME = "Verdict Cash";

client.on('ready', () => {
    console.log(`🚀 Hệ thống Verdict Economy đã online: ${client.user.tag}`);
});

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    const args = msg.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();
    const isAdmin = msg.member.roles.cache.has(ADMIN_ROLE_ID) || msg.member.permissions.has(PermissionFlagsBits.Administrator);

    // Lệnh xem Ví (Đã bỏ STK)
    if (command === '!vi') {
        const target = msg.mentions.users.first() || msg.author;
        try {
            let user = await prisma.user.findUnique({ where: { discordId: target.id } });
            if (!user) user = await prisma.user.create({ data: { discordId: target.id, balance: 5000 } });

            const embed = new EmbedBuilder()
                .setTitle(`💳 VÍ CỦA: ${target.username.toUpperCase()}`)
                .setColor("#00fbff")
                .addFields(
                    { name: "💵 SỐ DƯ", value: `**${user.balance.toLocaleString()}** ${CURRENCY_NAME}`, inline: true },
                    { name: "📈 TIỀN LỜI", value: `\`${user.profit.toLocaleString()}\` VC`, inline: true }
                )
                .setTimestamp();
            msg.reply({ embeds: [embed] });
        } catch (e) { msg.reply("❌ Lỗi kết nối ví."); }
    }

    // Lệnh Nạp (Admin)
    if (command === '!nap' && isAdmin) {
        const target = msg.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount)) return msg.reply("⚠️ HD: `!nap @user [số tiền]`");

        await updateBalance(target.id, amount);
        msg.reply(`✅ Đã nạp **${amount.toLocaleString()}** VC cho ${target}.`);
    }
});

// SỬA LỖI TOKEN TẠI ĐÂY
const TOKEN = process.env.DISCORD_TOKEN_ECONOMY;
if (!TOKEN) {
    console.error("❌ LỖI: Thiếu DISCORD_TOKEN_ECONOMY trong tab Variables của Railway!");
} else {
    client.login(TOKEN).catch(err => console.error("❌ LỖI LOGIN:", err.message));
}
