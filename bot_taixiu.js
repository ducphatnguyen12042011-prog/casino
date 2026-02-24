const { 
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType 
} = require('discord.js');

// Import các hàm từ hệ thống có sẵn của bạn
const { getBalance, updateBalance } = require('./shared/economy'); 
// Nếu bạn cần dùng trực tiếp prisma cho lịch sử:
// const { prisma } = require('./shared/prisma'); 

module.exports = {
    name: 'taixiu',
    description: 'Chơi Tài Xỉu bằng tiền ảo hệ thống',
    async execute(message) {
        const embed = new EmbedBuilder()
            .setTitle('🎲 TÀI XỈU MINI GAME')
            .setDescription('Hãy chọn **Tài** hoặc **Xỉu** và nhập số tiền cược.\n\n*Hệ thống sẽ tự động trừ/cộng tiền vào tài khoản của bạn.*')
            .setColor('#f1c40f')
            .setFooter({ text: 'Yêu cầu tối thiểu: 1,000' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('tx_tai').setLabel('TÀI').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('tx_xiu').setLabel('XỈU').setStyle(ButtonStyle.Primary)
        );

        await message.reply({ embeds: [embed], components: [row] });
    },

    async handleInteraction(interaction) {
        // 1. Nhấn nút -> Mở Modal nhập tiền
        if (interaction.isButton() && interaction.customId.startsWith('tx_')) {
            const side = interaction.customId === 'tx_tai' ? 'TÀI' : 'XỈU';
            
            const modal = new ModalBuilder()
                .setCustomId(`modal_${interaction.customId}`)
                .setTitle(`Đặt Cược ${side}`);

            const input = new TextInputBuilder()
                .setCustomId('bet_amount')
                .setLabel("Số tiền muốn cược (Min: 1,000)")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Nhập số tiền...')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return await interaction.showModal(modal);
        }

        // 2. Submit Modal -> Xử lý thắng thua & Tiền bạc
        if (interaction.type === InteractionType.ModalSubmit && interaction.customId.startsWith('modal_tx_')) {
            const amount = parseInt(interaction.fields.getTextInputValue('bet_amount'));
            const userChoice = interaction.customId.includes('tai') ? 'Tài' : 'Xỉu';
            const userId = interaction.user.id;

            // Kiểm tra đầu vào hợp lệ
            if (isNaN(amount) || amount < 1000) {
                return interaction.reply({ content: '❌ Số tiền không hợp lệ (Tối thiểu 1,000).', ephemeral: true });
            }

            // KIỂM TRA SỐ DƯ (Sử dụng hệ thống Pri/Shared của bạn)
            const currentBalance = await getBalance(userId);
            if (currentBalance < amount) {
                return interaction.reply({ content: `❌ Bạn không đủ tiền! Số dư hiện tại: **${currentBalance.toLocaleString()}**`, ephemeral: true });
            }

            // Lắc xúc xắc
            const dice = [
                Math.floor(Math.random() * 6) + 1,
                Math.floor(Math.random() * 6) + 1,
                Math.floor(Math.random() * 6) + 1
            ];
            const total = dice.reduce((a, b) => a + b, 0);
            
            let resultText;
            if (dice[0] === dice[1] && dice[1] === dice[2]) resultText = 'Đặc biệt';
            else resultText = total >= 11 ? 'Tài' : 'Xỉu';

            const isWin = (userChoice === resultText);

            // CẬP NHẬT TIỀN (Thắng cộng x1, thua trừ số tiền cược)
            if (isWin) {
                await updateBalance(userId, amount); // Cộng tiền thắng
            } else {
                await updateBalance(userId, -amount); // Trừ tiền thua
            }

            // Render Embed kết quả (theo mẫu ảnh bạn gửi)
            const resultEmbed = new EmbedBuilder()
                .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
                .setColor(isWin ? '#2ecc71' : '#e74c3c')
                .setDescription(`
🕒 **Thời gian**
${new Date().toLocaleString('vi-VN')}
📝 **Cược vào**
${userChoice}
💸 **Số tiền**
${amount.toLocaleString()}

--------------------------
**🎉 Kết quả phiên tài xỉu** 🟡
Phiên số: #${Math.floor(Math.random() * 9999)}

🎲 Xúc xắc 1: **${dice[0]}** | 2: **${dice[1]}** | 3: **${dice[2]}**

🔞 **Tổng số điểm: ${total}**
📝 **Kết quả: ${resultText}**
📈 **Nhà cái ${isWin ? 'trả' : 'ăn'}: ${amount.toLocaleString()}**
                `)
                .setFooter({ text: 'minecrafter.com' });

            await interaction.reply({ embeds: [resultEmbed] });
        }
    }
};
