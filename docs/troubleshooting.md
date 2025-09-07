# Troubleshooting

## Build fails: missing loader
- Run `npm install`
- Ensure devDependencies include `babel-loader` and `ts-loader`

## Extension not loading
- Verify `manifest.json` points to built files in `dist/`
- Check browser console for errors

## Slow performance
- Run `npm run bench` and review hot functions
- Use `performance/memory-profiler.js` to check leaks 