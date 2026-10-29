KrishiPlan AI — Google AI Studio Website Project

This is a complete Vite + React website project. It includes the trained browser-compatible Random Forest model and its crop profile/schema assets.

IMPORTANT: the model uses synthetic training labels. Do not use it for real agricultural/financial decisions without validation and verified regional data.

Google AI Studio import approach (UI labels can change):
1. Open Google AI Studio > Build mode and create a new web app project.
2. Wait for the first generation to finish.
3. Open the Code tab/file explorer.
4. If your file explorer offers an Add/+ > Upload ZIP option, use it to import this ZIP. If the ZIP importer asks what to do with existing files, replace starter files with this project's files so package.json, index.html, src/ and public/model/ are at the project root.
5. Save changes. Then ask the agent: "Inspect this imported project and ensure it runs in Google AI Studio Build preview. Do not replace the trained crop_model.json with a mock model. Install dependencies if needed, fix all build errors, and verify that public/model/crop_model.json, crop_profiles.json and crop_feature_schema.json load successfully."
6. If no ZIP-upload option is present, use Google AI Studio's Add files (+) > Import from GitHub route. Push the contents of this project folder to a GitHub repository, then import that repository.

To run locally (optional): install Node.js, run `npm install`, then `npm run dev`.

Model assets are in public/model/:
- crop_model.json
- crop_profiles.json
- crop_feature_schema.json

Inference helper: src/crop_predictor.js

Synthetic dataset and Python retraining files are in the separate FAPE_Smart_Crop_Planning_Starter.zip bundle, not in this website project.
