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

module.exports = {
    config: {
        name: "sing",
        version: "1.0",
        author: "ROBIUL 😍",
        countDown: 5,
        role: 0,
        shortDescription: {
            en: "Download audio from YouTube."
        },
        longDescription: {
            en: "Download audio from YouTube using an external API."
        },
        category: "𝗠𝗘𝗗𝗜𝗔",
        guide: {
            en: "{pn} <search query>"
        }
    },

    onStart: async function ({ message, event, args }) {
        const query = args.join(" ");

        if (!query) {
            return message.reply("❌ | Please provide a search query!\nUsage: {pn} <search query>");
        }

        let loadingMessageId;

        try {
           
            const loadingMessage = await message.reply(`🎧 w8 plz 🥹...\nSong: ${query}`);
            loadingMessageId = loadingMessage.messageID;

            const searchResults = await yts(query);

            if (!searchResults.videos.length) {
                return message.reply("❌ | No videos found for the given query.");
            }

            const topVideo = searchResults.videos[0];
            const videoURL = topVideo.url;

            try {
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

                
                if (loadingMessageId) {
                    await message.unsend(loadingMessageId);
                }

            
                message.reply({
                    body: `🎵 ${topVideo.title}`,
                    attachment: fs.createReadStream(filePath),
                }, () => {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                });
            } catch (error) {
                console.error("Download error:", error.message);
                return message.reply(`❌ | An error occurred while downloading the audio.\n${error.message}`);
            }
        } catch (error) {
            console.error("Search error:", error.message);
            return message.reply(`❌ | An error occurred while searching.\n${error.message}`);
        }
    },
};
