const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const PREFIX = '!';
let history = []; // Lưu trữ soi cầu

// Hệ thống ví giả lập (Thay bằng Database của bạn nếu có)
const balances = new Map();
const getBalance = (id) => balances.get(id) || 10000000;
const updateBalance = (id, amt) => balances.set(id, getBalance(id) + amt);

// --- 1. LỆNH KHỞI TẠO (!TX) ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    if (message.content.toLowerCase() === '!tx') {
        const embed = new EmbedBuilder()
            .setAuthor({ name: "CASINO INSTANT - KẾT QUẢ NGAY LẬP TỨC", iconURL: "https://i.imgur.com/8QO7Z6u.png" })
            .setTitle("🎲 BẠN MUỐN ĐẶT CỬA NÀO?")
            .setColor("#f1c40f")
            .setDescription("Kết quả sẽ được tính toán và hiển thị ngay sau khi bạn xác nhận tiền cược!")
            .addFields({ name: "📊 SOI CẦU GẦN NHẤT", value: history.slice(-12).map(h => h === 'tai' ? '🔴' : '⚪').join(' ') || 'Chưa có dữ liệu' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bet_tai').setLabel('ĐẶT TÀI').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('bet_xiu').setLabel('ĐẶT XỈU').setStyle(ButtonStyle.Primary)
        );

        await message.channel.send({ embeds: [embed], components: [row] });
    }
});

// --- 2. XỬ LÝ CƯỢC VÀ TRẢ KẾT QUẢ LIỀN ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        const side = interaction.customId === 'bet_tai' ? 'tai' : 'xiu';
        const modal = new ModalBuilder().setCustomId(`modal_${side}`).setTitle('🎫 PHIẾU CƯỢC NHANH');
        
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('money').setLabel('Số tiền cược').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit()) {
        // Fix lỗi "Đã xảy ra lỗi" bằng cách phản hồi ngay
        await interaction.deferReply(); 

        const side = interaction.customId.split('_')[1];
        const amount = parseInt(interaction.fields.getTextInputValue('money').replace(/,/g, ''));
        const uId = interaction.user.id;

        if (isNaN(amount) || amount < 1000) return interaction.editReply("❌ Tiền cược không hợp lệ!");
        if (getBalance(uId) < amount) return interaction.editReply("❌ Số dư không đủ!");

        // --- XỬ LÝ KẾT QUẢ NGAY LẬP TỨC ---
        const d = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
        const total = d[0] + d[1] + d[2];
        const result = total >= 11 ? 'tai' : 'xiu';
        const diceIcons = d.map(v => v === 1 ? '⚀' : v === 2 ? '⚁' : v === 3 ? '⚂' : v === 4 ? '⚃' : v === 5 ? '⚄' : '⚅').join(' ');
        
        history.push(result);
        const isWin = (side === result);
        
        if (isWin) updateBalance(uId, amount * 0.95);
        else updateBalance(uId, -amount);

        const resEmbed = new EmbedBuilder()
            .setTitle(isWin ? "🎉 CHIẾN THẮNG!" : "💀 RẤT TIẾC...")
            .setColor(isWin ? "#2ecc71" : "#e74c3c")
            .setDescription(
                `👤 **Người chơi:** <@${uId}>\n` +
                `🎯 **Bạn đã chọn:** **${side.toUpperCase()}**\n\n` +
                `🎲 **Xúc xắc:** **${diceIcons}** (${d.join('-')})\n` +
                `🏁 **Tổng điểm:** \`${total}\` => **${result.toUpperCase()}**\n\n` +
                `💰 **Ví hiện tại:** \`${getBalance(uId).toLocaleString()}\` xu`
            )
            .addFields({ name: "📊 SOI CẦU MỚI", value: history.slice(-15).map(h => h === 'tai' ? '🔴' : '⚪').join(' ') })
            .setTimestamp();

        await interaction.editReply({ embeds: [resEmbed] });
    }
});

client.once('ready', () => { console.log(`🚀 Bot Instant đã sẵn sàng!`); });
client.login(process.env.BOT_TOKEN);
