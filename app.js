require("dotenv/config");
const {
  Bot,
  session,
  InlineKeyboard,
  InlineQueryResultBuilder,
} = require("grammy");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const bot = new Bot(process.env.BOT_TOKEN);

const adminIds = [parseInt(process.env.ADMIN)];

bot.use(session({ initial: () => ({}) }));

// Reklama yuborish komandasi
bot.command("send_ad", async (ctx) => {
  const userId = ctx.from.id;

  if (!adminIds.includes(userId)) {
    return await ctx.reply(
      "🚫 Kechirasiz, siz reklamalarni yuborishga ruxsat etilmadingiz."
    );
  }

  await ctx.reply(
    "📝 Iltimos, reklamangizni yuboring (matn, rasm, video yoki hujjat):"
  );
  ctx.session.isSendingAd = true;
});

// Unique havolalar uchun Inline Query Handler
bot.on("inline_query", async (ctx) => {
  const query = ctx.inlineQuery.query.trim();

  // Agar so'rov bo'sh bo'lsa, default taklifni ko'rsating
  if (!query) {
    const uniqueLink = `https://t.me/${ctx.me.username}?start=${ctx.from.id}`;
    const result = InlineQueryResultBuilder.article(
      "Ulashish",
      "📤 Shaxsiy linkingizni ulashing!",
      {
        reply_markup: new InlineKeyboard()
          .url("✍️ Savol Berish", uniqueLink)
          .row(),
      }
    ).text(
      `🔗 ✅ «Anonim savollar» rasmiy boti.

🤓 Men bilan anonim suhbat quring. Sizning kimligingiz qabul qiluvchiga ko'rinmaydi.

Quyidagi havola orqali xabaringizni yo'llang!⤵️: 
${uniqueLink}\n\nUlashish uchun bosing!`
    );

    await ctx.answerInlineQuery([result], { cache_time: 0 });
    return;
  }

  // Boshqa so'rovlarga javob
  await ctx.answerInlineQuery([], { cache_time: 0 });
});

// Unique havolalar yaratish va ko'rsatish komandasi
bot.command("start", async (ctx) => {
  ctx.session = ctx.session || {};
  let userId = ctx.match;

  if (!userId) {
    userId = ctx.from.id.toString();
    const existingUser = await prisma.user.findUnique({ where: { userId } });

    if (!existingUser) {
      await prisma.user.create({ data: { userId } });
    }

    const uniqueLink = `https://t.me/${ctx.me.username}?start=${userId}`;
    const keyboard = new InlineKeyboard().switchInline("📤 Ulashish 🔗").row();

    await ctx.reply(
      `🎉 Sizning shaxsiy havolangiz:\n\n🔗 ${uniqueLink}\n\nUlashish uchun bosing va anonim suhbatlar quring!`,
      { reply_markup: keyboard }
    );

    ctx.session.askingUserId = null;
  } else {
    await ctx.reply("🤔 Iltimos, anonim savolingizni yozing:");
    ctx.session.askingUserId = parseInt(userId);
  }
});

// Foydalanuvchi sonini ko'rsatish komandasi
bot.command("users", async (ctx) => {
  const userCount = await prisma.user.count();
  await ctx.reply(`👥 Hozirda ${userCount} ta foydalanuvchi bor.`);
});

// Anonim savollar va javoblarni boshqarish
bot.on("message", async (ctx) => {
  if (ctx.session.replyingUserId) {
    const replyingUserId = ctx.session.replyingUserId;
    const replyText = ctx.message.text;

    const keyboard = new InlineKeyboard()
      .text("🔄 Javob berish", `reply:${ctx.from.id}`)
      .row()
      .text("🔎 ISHGA JOYLASHISH", `hello`);

    await ctx.api.sendMessage(
      replyingUserId,
      `💬 Sizning savolingizga javob berildi:\n\n${replyText}`,
      {
        reply_markup: keyboard,
      }
    );

    ctx.session.replyingUserId = null;
    await ctx.reply("✅ Sizning javobingiz anonim foydalanuvchiga yuborildi!");
    return;
  }

  if (ctx.session.askingUserId) {
    const askingUserId = ctx.session.askingUserId.toString();
    const questionText = ctx.message.text;

    await prisma.question.create({
      data: {
        userId: askingUserId,
        question: questionText,
      },
    });

    const keyboard = new InlineKeyboard()
      .text("🔄 Javob berish", `reply:${ctx.from.id}`)
      .row()
      .text("🔎 ISHGA JOYLASHISH", `hello`);

    await ctx.api.sendMessage(
      askingUserId,
      `📩 Sizga yangi anonim savol keldi:\n\n"${questionText}"`,
      {
        reply_markup: keyboard,
      }
    );

    const uniqueLink = `https://t.me/${ctx.me.username}?start=${ctx.from.id}`;
    const anotherQuestionKeyboard = new InlineKeyboard()
      .text("❓ Yana savol berish", `start:${ctx.session.askingUserId}`)
      .row()
      .text("🔎 ISHGA JOYLASHISH", `hello`);

    await ctx.reply(`✅ Sizning anonim savolingiz yuborildi!`, {
      reply_markup: anotherQuestionKeyboard,
    });

    ctx.session.askingUserId = null;
    return;
  }

  // Reklama yuborish
  if (ctx.session.isSendingAd) {
    const users = await prisma.user.findMany();

    if (ctx.message.text) {
      const adMessage = ctx.message.text;
      for (const user of users) {
        try {
          await ctx.api.sendMessage(user.userId, `📢 ${adMessage}`);
        } catch (error) {
          console.error(
            `Foydalanuvchiga xabar yuborilmadi: ${user.userId}`,
            error
          );
        }
      }
    }

    ctx.session.isSendingAd = false;
    await ctx.reply(
      "✅ Reklamangiz barcha foydalanuvchilarga muvaffaqiyatli yuborildi! 🎉"
    );
    return;
  }
});

// Javob va yangi anonim suhbatlar uchun callback query handler
bot.callbackQuery(/reply:(.+)/, async (ctx) => {
  const askingUserId = ctx.match[1];
  await ctx.reply("✍️ Javobingizni yozing:");
  ctx.session.replyingUserId = askingUserId;
});

bot.callbackQuery(/start:(.+)/, async (ctx) => {
  const userId = ctx.match[1];
  ctx.session.askingUserId = parseInt(userId);
  await ctx.reply("🤔 Yangi anonim savolingizni yozing:");
});

bot.callbackQuery("hello", async (ctx) => {
  await ctx.reply(
    "Assalomu alaykum!😊\n\nBo'sh ish o'rinlarini ko'rish uchun quyidagi havola orqali so'rov qoldiring  🔰\nhttps://t.me/+RGYfSDrzvNpiZjcy"
  );
});

// Botni ishga tushirish
bot.start();
