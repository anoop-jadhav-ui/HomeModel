"""Batch entry point for the portable FreeCAD Python runtime."""
import os
import runpy
import FreeCAD
import FreeCADGui
import builtins

builtins.App = FreeCAD
builtins.Gui = FreeCADGui
FreeCADGui.showMainWindow()
runpy.run_path(os.path.join(os.path.dirname(__file__), "build_home.py"), run_name="__main__")
