const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const yts = require("yt-search");

const tmpDir = path.join(__dirname, 'tmp');

if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
}

async function downloadFile(url, filePath) {
    const writer = fs.createWriteStream(filePath);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

async function downloadThumbnail(thumbnailUrl, filename) {
    const response = await axios({
        url: thumbnailUrl,
        method: 'GET',
        responseType: 'stream'
    });
    const filePath = path.join(tmpDir, filename);
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(filePath));
        writer.on('error', reject);
    });
}

module.exports = {
    config: {
        name: "ytb",
        version: "1.0",
        author: "ROBIUL 😍",
        countDown: 5,
        role: 0,
        shortDescription: {
            en: "Download video or audio from YouTube."
        },
        longDescription: {
            en: "Download video or audio from YouTube using an external API."
        },
        category: "𝗠𝗘𝗗𝗜𝗔",
        guide: {
            en: "{pn} [v | a] <search query>"
        }
    },

    onStart: async function ({ message, event, args,commandName }) {
        const type = args[0]?.toLowerCase();
        const query = args.slice(1).join(" ");

        if (!["v", "-v", "-a", "a"].includes(type) || !query) {
            return message.reply("❌ | Invalid usage! Please use:\n {pn} [v | a] <search query>");
        }

        try {
            const searchResults = await yts(query);

            if (!searchResults.videos.length) {
                return message.reply("❌ | No videos found for the given query.");
            }

            const top5Videos = searchResults.videos.slice(0, 5);

            const choiceList = top5Videos.map((video, index) => {
                return `${index + 1}. ${video.title} (${video.timestamp})`;
            });

            const thumbnailPromises = top5Videos.map(async (video) => {
                return await downloadThumbnail(video.thumbnail, `thumbnail_${video.videoId}.jpg`);
            });

            const thumbnailPaths = await Promise.all(thumbnailPromises);

            const resultMessage = `Here are the top 5 search results:\n${choiceList.join("\n")}\n\nReply with the number of your choice.`;

            const attachments = thumbnailPaths.map(path => fs.createReadStream(path));
            const sentMessage = await message.reply({
                body: resultMessage,
                attachment: attachments
            });

            global.GoatBot.onReply.set(sentMessage.messageID, {
                commandName,
                messageID: sentMessage.messageID,
                author: event.senderID,
                type,
                videos: top5Videos
            });

            thumbnailPaths.forEach(thumbnailPath => {
                if (fs.existsSync(thumbnailPath)) {
                    fs.unlinkSync(thumbnailPath);
                }
            });

        } catch (error) {
            console.error("Error:", error.message);
            return message.reply(`❌ | An error occurred while processing your request.\n${error.message}`);
        }
    },

    onReply: async function ({ message, event, api, Reply, args }) {
        const { author, type, videos, messageID: choiceListMessageId } = Reply;
        const choice = parseInt(args[0]);

        if (event.senderID !== author || isNaN(choice) || choice < 1 || choice > 5) {
            return message.reply("❌ | Invalid choice! Please select a number between 1 and 5.");
        }

        api.unsendMessage(choiceListMessageId);
        try {
            const selectedVideo = videos[choice - 1];
            const videoURL = selectedVideo.url;
            const videoTitle = selectedVideo.title;

            if (type === "v" || type === "-v") {
                const downloadApiUrl = `https://ytb-team-calyx-pxdf.onrender.com/download?url=${videoURL}&type=mp4&quality=360p`;
                const downloadApiResponse = await axios.get(downloadApiUrl);

                if (!downloadApiResponse.data.download_url) {
                    throw new Error("❌ | Error retrieving low-quality video download URL.");
                }

                const videoDownloadUrl = `https://ytb-team-calyx-pxdf.onrender.com/${encodeURIComponent(downloadApiResponse.data.download_url)}`;
                const filePath = path.join(tmpDir, `${videoTitle}_low.mp4`);

                const writer = fs.createWriteStream(filePath);
                const videoStream = await axios({
                    method: 'GET',
                    url: videoDownloadUrl,
                    responseType: 'stream'
                });

                videoStream.data.pipe(writer);

                writer.on('finish', async () => {
                    message.reply({
                        body: `${videoTitle} `,
                        attachment: fs.createReadStream(filePath)
                    }, event.threadID, () => {
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                        }
                    }, event.messageID);
                });
            } else if (type === "a" || type === "-a") {
                const downloadBaseURL = "https://ytb-team-calyx-pxdf.onrender.com";
                const downloadURL = `${downloadBaseURL}/download?url=${encodeURIComponent(videoURL)}&type=mp3`;

                const { data: downloadData } = await axios.get(downloadURL);

                if (!downloadData.download_url) {
                    throw new Error("❌ | Error getting download URL from external service.");
                }

                const fileName = downloadData.download_url.split("/").pop();
                const filePath = path.join(tmpDir, fileName);

                const fileDownloadURL = `${downloadBaseURL}/${downloadData.download_url}`;

                await downloadFile(fileDownloadURL, filePath);

                message.reply({
                    body: `${fileName.split('.').slice(0, -1).join('.')}`,
                    attachment: fs.createReadStream(filePath),
                }, () => {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                });
            }
        } catch (error) {
            console.error("Error:", error.message);
            return message.reply(`❌ | An error occurred while processing your request.\n${error.message}`);
        }
    },
};
