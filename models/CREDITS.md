# GMC Sierra Work Truck

Model by **Renafox / kryik1023**.

Source: https://sketchfab.com/3d-models/gmc-sierra-work-truck-1fae2b50fbe14d2c98296a2560a38399

License recorded in both uploaded GLBs: **CC BY-NC 4.0**.
https://creativecommons.org/licenses/by-nc/4.0/

These models are not covered by the application's MIT code license. Non-commercial use only under the model's license; separate permission would be needed for commercial use.

## Retained original

`gmc_sierra_work_truck.glb` remains byte-for-byte unchanged, including its textures. Its runtime adapter separates the four existing wheel components, neutralizes the baked wheel pose, applies uniform scale, removes the display ground from the game scene, and fits the suspension/collision rig to the model. Its previous configuration is preserved in `vehicle-original.json`.

## Red trial model

`gmc_sierra_red_light.glb` is the separately uploaded red variant. Its embedded metadata records these prior asset-preparation changes: red body material; resized/re-encoded shared detail maps; simple tinted glass; removed baked shadow plane; four independently pivoted straight wheels; coordinate conversion to Y-up with front +Z.

The red GLB is also kept byte-for-byte unchanged by this integration. Runtime adaptation preserves its red paint and shared trim/tire materials, applies one uniform scale, and connects the four named wheel pivots to the existing raycast rig. It does not replace or delete the original asset. The active configuration selects only the red file for the current trial.
