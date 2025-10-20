import app from './app';

const port = process.env.PORT || 8083;
app.listen(port, () => console.log('exporter listening on :' + port));
