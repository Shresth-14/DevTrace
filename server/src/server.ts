import app from "./app";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`DevTrace API server listening on port ${PORT}`);
});

