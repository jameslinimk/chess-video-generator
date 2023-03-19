import chalk from "chalk"
import ChessImageGenerator from "chess-image-generator"
import { Chess } from "chess.js"
import { Presets, SingleBar } from "cli-progress"
import ffmpeg from "fluent-ffmpeg"
import { existsSync } from "fs"
import { mkdir, readFile, readdir, rmdir } from "fs/promises"
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
    const rawHistory = chess.history({ verbose: true })

    const images: string[] = []
    const tempPath = join(__dirname, "../temp")
    const files = existsSync(tempPath) ? await readdir(tempPath) : []

    if (files.length === 0 || files.length !== rawHistory.length) {
        if (existsSync(tempPath)) await rmdir(tempPath, { recursive: true })
        if (!existsSync(tempPath)) await mkdir(tempPath)

        const imageGenerator = new ChessImageGenerator()
        const history = rawHistory.map((move) => move.after)

        const bar = new SingleBar({}, Presets.shades_grey)
        console.log(chalk.green("Generating images..."))
        bar.start(history.length, 0)

        for await (const [i, fen] of history.entries()) {
            if (i !== 0 && i % 1000 === 0) await wait(2000)

            imageGenerator.loadFEN(fen)
            const path = join(__dirname, `../temp/temp_${i}.png`)
            await imageGenerator.generatePNG(path)
            images.push(path)
            bar.update(i + 1)
        }

        bar.stop()
    } else {
        console.log(chalk.green("Found temp folder with the same amount of frames, skipping image generation"))
        files.forEach((file) => images.push(join(tempPath, file)))
    }

    const fps = Math.round(images.length / desiredTime)

    console.log()

    const videoPath = join(__dirname, "../", videoOutput)
    if (existsSync(videoPath)) console.log(chalk.yellow("Video already exists, overwriting..."))
    else console.log(chalk.green("Generating video..."))

    const bar = new SingleBar({}, Presets.shades_grey)
    bar.start(images.length, 0)

    ffmpeg()
        .input("./temp/temp_%d.png")
        .inputOptions([`-framerate ${fps}`])
        .videoCodec("libx264")
        .outputOptions(["-pix_fmt yuv420p"])
        .save(videoPath)
        .on("progress", (progress) => {
            bar.update(progress.frames)
        })
        .on("error", error)
        .on("end", () => {
            bar.stop()
            console.log()
            console.log(chalk.cyan("Video generated!"))
        })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
