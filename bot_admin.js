const { EmbedBuilder } = require('discord.js');
const ADMIN_ID = "1465374336214106237";

module.exports = async (message, args, prisma) => {
    const command = message.content.slice(1).trim().split(/ +/)[0];

    // Lệnh !vi (Ai cũng dùng được)
    if (command === 'vi') {
        const user = await prisma.user.findUnique({ where: { id: message.author.id } });
        const embed = new EmbedBuilder()
            .setTitle("🏦 VÍ TIỀN CỦA BẠN")
            .setThumbnail(message.author.displayAvatarURL())
            .addFields({ name: "Số dư hiện tại", value: `**${(user?.balance || 0).toLocaleString()}** VNĐ` })
            .setColor("#2f3136");
        return message.channel.send({ embeds: [embed] });
    }

    // Kiểm tra quyền Admin cho các lệnh dưới
    if (message.author.id !== ADMIN_ID) return;

    if (command === 'nap') {
        const target = message.mentions.users.first();
        const amount = parseInt(args[1]);
        if (!target || isNaN(amount)) return message.reply("Cú pháp: `!nap @user 10000`!");

        await prisma.user.update({
            where: { id: target.id },
            data: { balance: { increment: amount } }
        });

        const embed = new EmbedBuilder()
            .setTitle("✅ NẠP TIỀN THÀNH CÔNG")
            .setDescription(`Đã nạp **${amount.toLocaleString()}** cho ${target.mention}`)
            .setColor("Green");
        message.channel.send({ embeds: [embed] });
        
        // DM cho người được nạp
        await sendPrivateNotice(target, "💰 BIẾN ĐỘNG SỐ DƯ", `Tài khoản của bạn đã được cộng **+${amount.toLocaleString()}** VNĐ từ Admin.`);
    }

    if (command === 'xemvi') {
        const target = message.mentions.users.first();
        if (!target) return message.reply("Cú pháp: `!xemvi @user`!");
        
        const user = await prisma.user.findUnique({ where: { id: target.id } });
        const embed = new EmbedBuilder()
            .setTitle(`🏦 VÍ TIỀN CỦA ${target.username}`)
            .addFields({ name: "Số dư", value: `**${(user?.balance || 0).toLocaleString()}** VNĐ` })
            .setColor("Blue");
        message.channel.send({ embeds: [embed] });
    }
};
