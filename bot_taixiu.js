const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } = require('discord.js');
// Giả sử bạn import hàm xử lý tiền từ file economy của bạn
// const { getBalance, updateBalance } = require('./shared/economy'); 

module.exports = {
    name: 'taixiu',
    description: 'Chơi game Tài Xỉu',
    async execute(message) {
        const embed = new EmbedBuilder()
            .setTitle('🎲 TÀI XỈU - CASINO TRỰC TUYẾN')
            .setDescription('Nhấn vào nút bên dưới để chọn cửa đặt cược.\n\n**Lưu ý:** Mức cược tối thiểu là **1,000**.')
            .setColor('#ffcc00')
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('tx_tai').setLabel('TÀI').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('tx_xiu').setLabel('XỈU').setStyle(ButtonStyle.Primary)
        );

        await message.reply({ embeds: [embed], components: [row] });
    },

    // Hàm xử lý tương tác (Nút bấm và Modal)
    async handleInteraction(interaction) {
        // 1. Hiển thị Modal nhập tiền khi nhấn nút
        if (interaction.isButton()) {
            const betType = interaction.customId === 'tx_tai' ? 'Tài' : 'Xỉu';
            
            const modal = new ModalBuilder()
                .setCustomId(`modal_${interaction.customId}`)
                .setTitle(`Đặt Cược: ${betType.toUpperCase()}`);

            const amountInput = new TextInputBuilder()
                .setCustomId('bet_amount')
                .setLabel("Số tiền muốn cược (Tối thiểu 1,000)")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Nhập số tiền...')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
            return await interaction.showModal(modal);
        }

        // 2. Xử lý logic thắng thua sau khi nộp Modal
        if (interaction.type === InteractionType.ModalSubmit) {
            const amount = parseInt(interaction.fields.getTextInputValue('bet_amount'));
            const userChoice = interaction.customId.includes('tai') ? 'Tài' : 'Xỉu';

            // Kiểm tra số tiền hợp lệ
            if (isNaN(amount) || amount < 1000) {
                return interaction.reply({ content: '❌ Số tiền không hợp lệ (Phải từ 1,000 trở lên).', ephemeral: true });
            }

            // --- ĐOẠN NÀY BẠN CHECK SỐ DƯ TỪ PRISMA/ECONOMY ---
            // const balance = await getBalance(interaction.user.id);
            // if (balance < amount) return interaction.reply({ content: 'Bạn không đủ tiền!', ephemeral: true });

            // Lắc xúc xắc
            const dice = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
            const total = dice.reduce((a, b) => a + b, 0);
            
            let result;
            if (dice[0] === dice[1] && dice[1] === dice[2]) result = 'Đặc biệt';
            else result = total >= 11 ? 'Tài' : 'Xỉu';

            const isWin = (userChoice === result);

            // --- ĐOẠN NÀY CẬP NHẬT TIỀN VÀO DATABASE ---
            // if (isWin) await updateBalance(interaction.user.id, amount);
            // else await updateBalance(interaction.user.id, -amount);

            const resultEmbed = new EmbedBuilder()
                .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
                .setColor(isWin ? '#00ff00' : '#ff0000')
                .setDescription(`
**🕒 Thời gian**
${new Date().toLocaleString('vi-VN')}
**📝 Cược vào**
${userChoice}
**💸 Số tiền**
${amount.toLocaleString()}

----------------------------------
**🎉 Kết quả phiên tài xỉu** 🟡
Phiên số: #${Math.floor(Math.random() * 10000)}

🎲 Xúc xắc 1: **${dice[0]}** | 2: **${dice[1]}** | 3: **${dice[2]}**

**🔞 Tổng số điểm: ${total}**
**📝 Kết quả: ${result}**
**📈 Nhà cái ${isWin ? 'trả' : 'ăn'}: ${amount.toLocaleString()}**
                `)
                .setFooter({ text: 'minecrafter.com' });

            await interaction.reply({ embeds: [resultEmbed] });
        }
    }
};
