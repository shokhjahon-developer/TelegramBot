const { Bot, session, InlineKeyboard } = require("grammy");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const bot = new Bot(process.env.BOT_TOKEN);
const adminIds = [parseInt(process.env.ADMIN)];

bot.use(session({ initial: () => ({}) }));

bot.command("send_ad", async (ctx) => {
  const userId = ctx.from.id;

  if (!adminIds.includes(userId)) {
    return await ctx.reply("🚫 Sorry, you are not authorized to send ads.");
  }

  await ctx.reply(
    "📝 Iltimos reklamangizni jo'nating (text, image, video, yoki document):"
  );
  ctx.session.isSendingAd = true;
});

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
    const keyboard = new InlineKeyboard()
      .url(
        "📤 Havolani ulashish",
        `https://t.me/share/url?url=${encodeURIComponent(
          uniqueLink
        )}&text=Havotirsiz%20anonim%20suhbat%20quring!`
      )
      .row();

    await ctx.reply(
      `🎉 Bu sizning shaxsiy havolangiz:\n\n🔗 ${uniqueLink}\n\n🔒 Havolangizni ulashing va havotirsiz anonim suhbat quring!`,
      { reply_markup: keyboard }
    );

    ctx.session.askingUserId = null;
  } else {
    await ctx.reply("🤔 Iltimos, anonim savolingizni bering: ");
    ctx.session.askingUserId = parseInt(userId);
  }
});

bot.command("users", async (ctx) => {
  const userCount = await prisma.user.count();
  await ctx.reply(`👥 Hozirda ${userCount} ta foydalanuvchi bor.`);
});

bot.on("message", async (ctx) => {
  if (ctx.session.replyingUserId) {
    const replyingUserId = ctx.session.replyingUserId;
    const replyText = ctx.message.text;

    const keyboard = new InlineKeyboard()
      .text("🔄 Javob berish", `reply:${ctx.from.id}`)
      .row()
      .text("ISHGA JOYLASHISH", `hello`);

    await ctx.api.sendMessage(
      replyingUserId,
      `💬 Sizning savolingizga javob berildi: \n\n${replyText}`,
      {
        reply_markup: keyboard,
      }
    );

    ctx.session.replyingUserId = null;
    await ctx.reply("✅ Sizning javobingiz anonim foydalanuvchiga jo'natildi!");
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
      .text("ISHGA JOYLASHISH", `hello`);

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
      .text("ISHGA JOYLASHISH", `hello`);

    await ctx.reply(`✅ Sizning anonim savolingiz jo'natildi!`, {
      reply_markup: anotherQuestionKeyboard,
    });

    const shareLinkKeyboard = new InlineKeyboard()
      .url(
        "📤 Havolani ulashish",
        `https://t.me/share/url?url=${encodeURIComponent(
          uniqueLink
        )}&text=Havotirsiz%20anonim%20suhbat%20quring!`
      )
      .row();

    await ctx.reply(
      `🎉 Bu sizning shaxsiy havolangiz:\n\n🔗 ${uniqueLink}\n\n🔒 Havolangizni ulashing va havotirsiz anonim suhbat quring!`,
      { reply_markup: shareLinkKeyboard }
    );

    ctx.session.askingUserId = null;
    return;
  }

  if (ctx.session.isSendingAd) {
    const users = await prisma.user.findMany();

    if (ctx.message.text) {
      const adMessage = ctx.message.text;
      for (const user of users) {
        try {
          await ctx.api.sendMessage(user.userId, `📢 ${adMessage}`);
        } catch (error) {
          console.error(
            `Could not send message to user ${user.userId}:`,
            error
          );
        }
      }
    } else if (ctx.message.photo) {
      const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      for (const user of users) {
        try {
          await ctx.api.sendPhoto(user.userId, photoId, {
            caption: ctx.message.caption || "",
          });
        } catch (error) {
          console.error(`Could not send photo to user ${user.userId}:`, error);
        }
      }
    } else if (ctx.message.video) {
      const videoId = ctx.message.video.file_id;
      for (const user of users) {
        try {
          await ctx.api.sendVideo(user.userId, videoId, {
            caption: ctx.message.caption || "",
          });
        } catch (error) {
          console.error(`Could not send video to user ${user.userId}:`, error);
        }
      }
    } else if (ctx.message.document) {
      const documentId = ctx.message.document.file_id;
      for (const user of users) {
        try {
          await ctx.api.sendDocument(user.userId, documentId, {
            caption: ctx.message.caption || "",
          });
        } catch (error) {
          console.error(
            `Could not send document to user ${user.userId}:`,
            error
          );
        }
      }
    }

    ctx.session.isSendingAd = false;
    await ctx.reply("✅ Your ad has been successfully sent to all users! 🎉");
    return;
  }
});

bot.callbackQuery(/reply:(.+)/, async (ctx) => {
  const askingUserId = ctx.match[1];
  await ctx.reply("✍️ Iltimos javobingizni yozing:");
  ctx.session.replyingUserId = askingUserId;
});

bot.callbackQuery(/start:(.+)/, async (ctx) => {
  const userId = ctx.match[1];
  ctx.session.askingUserId = parseInt(userId);
  await ctx.reply("🤔 Iltimos, yangi anonim savolingizni bering:");
});

bot.callbackQuery("hello", async (ctx) => {
  await ctx.reply(
    "Assalomu alaykum!😊\n\nBo'sh ish o'rinlarini ko'rish uchun quyidagi havola orqali so'rov qoldiring 🔰\nhttps://t.me/+RGYfSDrzvNpiZjcy"
  );
});

bot.start();
