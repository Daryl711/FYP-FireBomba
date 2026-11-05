"""Verify ONNX preprocessing and exported probability handling."""

import unittest
from unittest.mock import MagicMock, patch

import numpy as np
from PIL import Image

from yolo_detection.inference import DEFAULT_MODEL, MobileNetClassifier


class ClassifierTests(unittest.TestCase):
    def setUp(self):
        self.session = MagicMock()
        self.session.get_inputs.return_value[0].name = "images"
        self.session.get_outputs.return_value[0].name = "probabilities"
        self.session.run.return_value = [np.array([[0.8, 0.15, 0.05]], dtype=np.float32)]
        with patch("yolo_detection.inference.ort.InferenceSession", return_value=self.session) as factory:
            self.classifier = MobileNetClassifier()
        factory.assert_called_once_with(str(DEFAULT_MODEL), providers=["CPUExecutionProvider"])

    def test_exported_probabilities_are_not_softmaxed_twice(self):
        result = self.classifier.predict(Image.new("RGB", (256, 256), "red"))
        self.assertEqual(result["class"], "fire")
        self.assertAlmostEqual(result["confidence"], 0.8)

    def test_rgb_normalization_and_center_padding(self):
        self.classifier.predict(Image.new("RGB", (256, 128), (255, 0, 0)))
        tensor = self.session.run.call_args.args[1]["images"]
        self.assertEqual(tensor.shape, (1, 3, 256, 256))
        self.assertEqual(tensor.dtype, np.float32)
        self.assertTrue(tensor.flags.c_contiguous)
        mean = np.array([0.485, 0.456, 0.406])
        std = np.array([0.229, 0.224, 0.225])
        np.testing.assert_allclose(tensor[0, :, 128, 128], ([1, 0, 0] - mean) / std, rtol=1e-6)
        np.testing.assert_allclose(tensor[0, :, 0, 0], (114 / 255 - mean) / std, rtol=1e-6)

    def test_rejects_mismatched_output_classes(self):
        self.session.run.return_value = [np.array([[0.9, 0.1]])]
        with self.assertRaises(ValueError):
            self.classifier.predict(Image.new("RGB", (256, 256)))


if __name__ == "__main__":
    unittest.main()
