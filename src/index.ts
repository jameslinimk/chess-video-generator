import chalk from "chalk"
import ChessImageGenerator from "chess-image-generator"
import { Chess } from "chess.js"
import ffmpeg from "fluent-ffmpeg"
import { existsSync } from "fs"
import { mkdir, readFile, readdir } from "fs/promises"
import { dirname, join } from "path"
import { fileURLToPath, pathToFileURL } from "url"
import { desiredTime, pgnFile, videoOutput } from "./config.js"

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const pgnPath = join(__dirname, "../", pgnFile)

const error = (...args: any[]) => {
    console.log(chalk.red(...args))
    process.exit(1)
}

const main = async () => {
    if (!existsSync(pgnPath)) error("No game.pgn file found")
    const pgn = await readFile(pgnPath, "utf-8")

    const chess = new Chess()
    try {
        chess.loadPgn(pgn)
    } catch (err) {
        error("Invalid PGN! " + `${err}`.replace("Error: Invalid FEN: ", ""))
    }

    const images: string[] = []
    const tempPath = join(__dirname, "../temp")
    if (!existsSync(tempPath)) {
        await mkdir(tempPath)

        const imageGenerator = new ChessImageGenerator()
        const history = chess.history({ verbose: true }).map((move) => move.after)

        for await (const [i, fen] of history.entries()) {
            if (i !== 0 && i % 1000 === 0) {
                console.log(chalk.greenBright("Waiting for 2 seconds to prevent corruption..."))
                await wait(2000)
            }

            imageGenerator.loadFEN(fen)
            const path = join(__dirname, `../temp/temp_${i}.png`)
            await imageGenerator.generatePNG(path)
            images.push(path)
            console.log(chalk.green(`Generated image ${i + 1}/${history.length}`))
        }
    } else {
        console.log(chalk.green("Found temp folder, skipping image generation"))
        const files = await readdir(tempPath)
        files.forEach((file) => images.push(join(tempPath, file)))
    }

    const fps = Math.round(images.length / desiredTime)

    console.log()
    ffmpeg()
        .input("./temp/temp_%d.png")
        .inputOptions([`-framerate ${fps}`])
        .videoCodec("libx264")
        .outputOptions(["-pix_fmt yuv420p"])
        .save(join(__dirname, "../", videoOutput))
        .on("start", (commandLine) => {
            console.log(chalk.greenBright(`FFmpeg started with command: ${chalk.gray(commandLine)}`))
        })
        .on("progress", (progress) => {
            const percent = Math.round((progress.frames / images.length) * 100)
            console.log(chalk.green(`Processing, ${percent}% done`))
        })
        .on("error", console.error)
        .on("end", () => {
            console.log(chalk.green("Video generated!"))
        })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
