FAN11_FSK_IPV6 = {
    "WN-L031-30": "FD12:3456::B635:22FF:FE98:2537",
    "WN-L032-30": "FD12:3456::B635:22FF:FE98:2523",
    "WN-L033-30": "FD12:3456::B635:22FF:FE98:252B",
    "WN-L034-30": "FD12:3456::62A4:23FF:FE37:A3B3",
    "WN-L035-30": "FD12:3456::B635:22FF:FE98:285B",
    "WN-L036-30": "FD12:3456::62A4:23FF:FE37:A3A1",
    "WN-L037-30": "FD12:3456::B635:22FF:FE98:2539",
    "WN-OF04-34": "FD12:3456::B635:22FF:FE98:285C",
    "WN-L050-30": "FD12:3456::92FD:9FFF:FEEE:9DF7",
    "WN-L051-30": "FD12:3456::B635:22FF:FE98:285D",
    "WN-L038-30": "FD12:3456::B635:22FF:FE98:253F",
    "WN-L039-30": "FD12:3456::62A4:23FF:FE37:A3A8",
    "WN-L040-30": "FD12:3456::B635:22FF:FE98:2541",
    "WN-L041-30": "FD12:3456::B635:22FF:FE98:2529",
    "WN-L042-30": "FD12:3456::62A4:23FF:FE37:A3AC",
    "WN-L043-30": "FD12:3456::62A4:23FF:FE37:A39F",
    "WN-L044-30": "FD12:3456::B635:22FF:FE98:2534",
    "WN-L045-30": "FD12:3456::B635:22FF:FE98:2524",
    "WN-L047-30": "FD12:3456::92FD:9FFF:FEEE:9D40",
    "WN-L048-30": "FD12:3456::B635:22FF:FE98:29A6",
    "WN-L052-30": "FD12:3456::62A4:23FF:FE37:A3AD",
    "WN-L053-30": "FD12:3456::B635:22FF:FE98:252C",
    "WN-L054-30": "FD12:3456::B635:22FF:FE98:251E",
    "WN-VA24-30": "FD12:3456::B635:22FF:FE98:253E",
    "WN-VA64-30": "FD12:3456::B635:22FF:FE98:285E",
    "WN-VC44-30": "FD12:3456::62A4:23FF:FE37:A3A9",
    "WN-NI04-34": "FD12:3456::62A4:23FF:FE37:A3AB",
    "WN-L059-34": "FD12:3456::B635:22FF:FE98:29A5"
}

# Device to Pole Number Mapping
# Adjust these pole numbers according to your actual pole assignments
DEVICE_POLE_MAPPING = {
    "WN-L031-30": "2",
    "WN-L032-30": "4", 
    "WN-L033-30": "6",
    "WN-L034-30": "18",
    "WN-L035-30": "PT21",
    "WN-L036-30": "17C",
    "WN-L037-30": "17Z",
    "WN-OF04-34": "Faculty Quarter control Point",
    "WN-L050-30": "65",
    "WN-L051-30": "20",
    "WN-L038-30": "22",
    "WN-L039-30": "26",
    "WN-L040-30": "31",
    "WN-L041-30": "33",
    "WN-L042-30": "35",
    "WN-L043-30": "37",
    "WN-L044-30": "39",
    "WN-L045-30": "41",
    "WN-L047-30": "83",
    "WN-L048-30": "80",
    "WN-L052-30": "FBG02",
    "WN-L053-30": "FBG04",
    "WN-L054-30": "FBG06",
    "WN-VA24-30": "Vindya A2 Terrace",
    "WN-VA64-30": "Vindya A6 Terrace",
    "WN-VC44-30": "Vindya C4 Terrace",
    "WN-NI04-34": "Nilgiri Control Point",
    "WN-L059-34": "Football ground Control Point"
}

def get_pole_number(device_name):
    """Get pole number for a given device name"""
    return DEVICE_POLE_MAPPING.get(device_name, "Unknown")