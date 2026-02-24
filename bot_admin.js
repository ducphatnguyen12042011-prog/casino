const ADMIN_ID = "1465374336214106237";

module.exports = {
    async xemvi(message, args, prisma) {
        if (message.author.id !== ADMIN_ID) return;
        const target = message.mentions.users.first() || message.author;
        const user = await prisma.user.findUnique({ where: { id: target.id } });
        
        const embed = new EmbedBuilder()
            .setTitle(`🏦 VÍ TIỀN: ${target.username}`)
            .addFields({ name: 'Số dư', value: `**${user?.balance.toLocaleString() || 0}** VNĐ` })
            .setColor('#2f3136');
        message.channel.send({ embeds: [embed] });
    },
    
    async nap(message, args, prisma) {
        if (message.author.id !== ADMIN_ID) return;
        const target = message.mentions.users.first();
        const amount = parseInt(args[1]);
        if (!target || isNaN(amount)) return message.reply("Cú pháp: !nap @user 1000");

        await prisma.user.update({
            where: { id: target.id },
            data: { balance: { increment: amount } }
        });
        message.reply(`✅ Đã nạp thành công **${amount.toLocaleString()}** cho ${target.tag}`);
    }
}
