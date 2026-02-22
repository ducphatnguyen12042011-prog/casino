const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const { getBalance, updateBalance, prisma } = require('./shared/economy');
const client = new Client({ intents: [32767] });

const ID_KENH_SHOP = "1474695449167400972";
const ID_CATEGORY_TICKET = "ID_CATEGORY_CUA_BAN";

// --- 1. LỆNH ADMIN THÊM SẢN PHẨM: !additem [Tên] [Giá] ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;

    if (msg.content.startsWith('!additem')) {
        if (!msg.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        
        const args = msg.content.split(' ');
        const name = args[1];
        const price = parseInt(args[2]);

        if (!name || isNaN(price)) return msg.reply("Cú pháp: `!additem [Tên_Không_Dau] [Giá]`");

        await prisma.item.upsert({
            where: { name: name },
            update: { price: price },
            create: { name: name, price: price }
        });

        msg.reply(`✅ Đã thêm sản phẩm **${name}** với giá **${price.toLocaleString()}** Cash.`);
        updateShopDisplay(); // Cập nhật lại giao diện shop
    }

    // Lệnh để bot gửi tin nhắn Shop lần đầu
    if (msg.content === '!setup_shop') {
        if (!msg.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        updateShopDisplay();
    }
});

// --- 2. HÀM TỰ ĐỘNG CẬP NHẬT GIAO DIỆN SHOP ---
async function updateShopDisplay() {
    const channel = await client.channels.fetch(ID_KENH_SHOP);
    const items = await prisma.item.findMany();

    // Xóa tin nhắn cũ của bot
    const messages = await channel.messages.fetch({ limit: 10 });
    const botMsgs = messages.filter(m => m.author.id === client.user.id);
    if (botMsgs.size > 0) await channel.bulkDelete(botMsgs);

    const embed = new EmbedBuilder()
        .setTitle("🛒 CỬA HÀNG VERDICT")
        .setDescription("Nhấn vào nút bên dưới để đổi quà tự động!")
        .setColor(0x00ff00)
        .setTimestamp();

    const row = new ActionRowBuilder();
    
    items.forEach(item => {
        embed.addFields({ name: `📦 ${item.name}`, value: `Giá: \`${item.price.toLocaleString()}\` Cash`, inline: true });
        
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`buy_${item.name}`)
                .setLabel(`Mua ${item.name}`)
                .setStyle(ButtonStyle.Success)
        );
    });

    if (items.length > 0) {
        await channel.send({ embeds: [embed], components: [row] });
    } else {
        await channel.send("Hiện tại shop đang trống. Admin hãy dùng lệnh `!additem`.");
    }
}

// --- 3. XỬ LÝ KHI NGƯỜI DÙNG BẤM NÚT ĐỔI ĐỒ ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('buy_')) return;

    const itemName = interaction.customId.replace('buy_', '');
    const item = await prisma.item.findUnique({ where: { name: itemName } });

    if (!item) return interaction.reply({ content: "Sản phẩm không còn tồn tại!", ephemeral: true });

    const balance = await getBalance(interaction.user.id);
    if (balance < item.price) return interaction.reply({ content: `❌ Bạn không đủ tiền! Cần \`${item.price.toLocaleString()}\` Cash.`, ephemeral: true });

    // Trừ tiền
    await updateBalance(interaction.user.id, -item.price);

    // Tạo Ticket cho Admin xử lý
    const guild = interaction.guild;
    const ticketChannel = await guild.channels.create({
        name: `🎟️-${itemName}-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: ID_CATEGORY_TICKET,
        permissionOverwrites: [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        ],
    });

    await ticketChannel.send(`📦 ${interaction.user} đã mua **${itemName}**. Số dư còn lại: \`${(balance - item.price).toLocaleString()}\` Cash.\nAdmin vui lòng xử lý cho khách!`);
    
    await interaction.reply({ content: `✅ Mua thành công! Hãy vào ${ticketChannel} để nhận hàng.`, ephemeral: true });
});

client.login(process.env.DISCORD_TOKEN_SHOP);
