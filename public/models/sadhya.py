# Quick setup inside Google Colab using ipywidgets
import ipywidgets as widgets
from IPython.display import display, HTML

# Interactive Sadhya Dish Selector
dish_select = widgets.Dropdown(
    options=['Inji Puli', 'Avial', 'Thoran', 'Sambar', 'Palada Payasam'],
    description='Select Dish:'
)

leaf_zone = widgets.RadioButtons(
    options=['Top Left', 'Top Right', 'Bottom Center', 'Bottom Right'],
    description='Leaf Area:'
)

button = widgets.Button(description="Place Dish", button_style='success')
output = widgets.Output()

def place_dish(b):
    with output:
        output.clear_output()
        # Custom logic validating traditional placement rules
        if dish_select.value == 'Inji Puli' and leaf_zone.value == 'Top Left':
            print(f" Correct! {dish_select.value} goes on the {leaf_zone.value}.")
        else:
            print(f" Incorrect placement for {dish_select.value}!")

button.on_click(place_dish)
display(dish_select, leaf_zone, button, output)