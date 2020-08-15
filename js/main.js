const electron = require('electron')
const electronLocalshortcut = require ( 'electron-localshortcut' )
const path = require('path')
const url  = require('url' )

const app = electron.app;
const BrowserWindow = electron.BrowserWindow
const Menu = electron.Menu

let mainWindow
let helpWindow

function createWindow () {

	mainWindow = new BrowserWindow ( {
		webPreferences: { nodeIntegration: true },
		width: 800,
		height: 768,
		minWidth: 600,
		minHeight: 768,
		x: 0,
		y: 100
	});

	let wc = mainWindow.webContents;

	mainWindow.loadURL("file://" + __dirname + "/../index.html");
	//mainWindow.webContents.openDevTools();
	mainWindow.on('closed', function () {
		mainWindow = null;
	});

	electronLocalshortcut.register ( mainWindow, 'Alt+CommandOrControl+Shift+I', () => {
        mainWindow.toggleDevTools()
	})

	electronLocalshortcut.register ( mainWindow, 'CommandOrControl+R', () => {
        mainWindow.reload()
	})

	var menuJSON = [];
	menuJSON.push ({ label: 'Menu', submenu: [] })
	menuJSON[0].submenu.push ({ label: 'Settings', click () {
		wc.send ('OPEN_SETTINGS', {})
	}})
	menuJSON[0].submenu.push ({ label: 'Help', click () {
		helpWindow = new BrowserWindow ( {
			width: 850,
			height: 768,
			minWidth: 600,
			minHeight: 768
		})
		helpWindow.loadURL("file://" + __dirname + "/../help/help.html");
		helpWindow.removeMenu()
	}})
	menuJSON[0].submenu.push ({ label: 'Exit', click () {
		app.quit()
	}})
	Menu.setApplicationMenu ( Menu.buildFromTemplate ( menuJSON ) )
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
	// On OS X it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
//	if (process.platform !== 'darwin') {
		app.quit();
//	}
})

app.on('activate', function () {
	// On OS X it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (mainWindow === null) {
		createWindow();
	}
})