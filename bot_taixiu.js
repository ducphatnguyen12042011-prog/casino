const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = async (message, args, prisma) => {
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) return message.reply("Vui lòng nhập số tiền hợp lệ!");

    // 1. Kiểm tra số dư người dùng từ Prisma
    const user = await prisma.user.findUnique({ where: { id: message.author.id } });
    if (!user || user.balance < amount) return message.reply("Bạn không đủ tiền!");

    // 2. Tạo Embed đặt cược
    const embed = new EmbedBuilder()
        .setTitle('🎲 PHIÊN TÀI XỈU MỚI')
        .setDescription(`Người đặt: ${message.author}\nSố tiền: **${amount.toLocaleString()}**\n\nChọn **Tài** hoặc **Xỉu** bên dưới!`)
        .setColor('#0099ff')
        .setFooter({ text: 'Cầu gần đây: ● ○ ● ● ○' }); // Bạn có thể lấy cầu từ DB

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bet_tai').setLabel('TÀI').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('bet_xiu').setLabel('XỈU').setStyle(ButtonStyle.Primary),
    );

    const msg = await message.channel.send({ embeds: [embed], components: [row] });

    // 3. Xử lý tương tác Button
    const filter = i => i.user.id === message.author.id;
    const collector = msg.createMessageComponentCollector({ filter, time: 30000 });

    collector.on('collect', async i => {
        const dice = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
        const total = dice.reduce((a, b) => a + b, 0);
        const resultText = total >= 11 ? 'TAI' : 'XIU';
        const win = (i.customId === 'bet_tai' && total >= 11) || (i.customId === 'bet_xiu' && total <= 10);

        // Cập nhật Database
        await prisma.user.update({
            where: { id: message.author.id },
            data: { balance: win ? { increment: amount } : { decrement: amount } }
        });

        const resultEmbed = new EmbedBuilder()
            .setTitle(win ? '🎉 CHIẾN THẮNG' : '💀 THẤT BẠI')
            .setDescription(`Kết quả: **${total}** (${dice.join(' - ')})\nBạn chọn: **${i.customId === 'bet_tai' ? 'Tài' : 'Xỉu'}**\nSố tiền: ${win ? '+' : '-'}${amount.toLocaleString()}`)
            .setColor(win ? '#00ff00' : '#ff0000');

        await i.update({ embeds: [resultEmbed], components: [] });
    });
};
