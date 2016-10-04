'use strict'

var qs = require('querystring')
var fs = require('fs')
var path = require('path')
var express = require('express')
var app = express()
var multiparty = require('multiparty')

var get = require('simple-get')
var readFileCalled = false
var DATABASE = {}

fs.readFile = function (fp, enc, cb) {
  if (readFileCalled) return cb(null, JSON.stringify(DATABASE))
  readFileCalled = true
  cb(null, '{}')
}

fs.writeFile = function (fp, data, enc, cb) {
  DATABASE = JSON.parse(data)
  cb()
}

fs.chmodSync('./images', '777')

function getDB (cb) {
  fs.readFile('./db.json', 'utf-8', function (err, data) {
    if (err) throw err
    var db = JSON.parse(data)
    cb(null, {
      db: db,
      count: Object.keys(db).length
    })
  })
}

app.use('/images', express.static('./images'))
app.get('/stats', function (req, res) {
  if (req.get('My-Authorization') === 'Admin') {
    getDB(function (e, data) {
      var commentsCount = 0
      for (var id in data.db) {
        commentsCount += data.db[id].comments.length
      }
      res.send(`
        Total TODOs: ${data.count} <br>
        Total comments: ${commentsCount}
      `)
    })
    return
  }
  res.status(404).send('No permissions')
})

app.get('/stats-test', function (req, res) {
  get.concat({
    url: 'http://localhost:4294/stats',
    headers: {
      'My-Authorization': 'Admin'
    }
  }, function (err, response, data) {
    if (err) throw err
    res.send(data.toString())
  })
})

app.get('/', function (req, res) {
  res.sendFile(path.resolve('./views/index.html'))
})

app.get('/okey', function (req, res) {
  res.sendFile(path.resolve('./views/okey.html'))
})

app.get('/create', function (req, res) {
  res.sendFile(path.resolve('./views/create.html'))
})

app.get('/details/:id', function (req, res) {
  getDB(function (e, data) {
    var db = data.db
    var todo = db[req.params.id]
    var comments = `
      <p><a href="/details/${todo.id}/comment">Write a comment</a></p>
    `
    var html = `
      <h1>Menu</h1>
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/create">Create TODO</a></li>
        <li><a href="/all">View TODOs</a></li>
      </ul>
      <h2>${todo.title}</h2>
      ${todo.img ? `<p><img src="${todo.img}"></p>` : ''}
      <p>${todo.descr}</p>
      <p>State: <b>${todo.state}</b></p>
      <h3>Comments</h3>
      ${todo.comments.length ? todo.comments.map(function (comment) {
        return `${comment.id}. ${comment.text} // ${comment.date} <hr>`
      }) : 'No comments for this one!<hr>'}
      ${comments}
    `
    // dirty hack for template strings
    html = html.replace(/<hr>,/g, '<hr>')
    res.send(html)
  })
})

app.get('/details/:id/comment', function (req, res) {
  getDB(function (e, data) {
    var db = data.db
    var todo = db[req.params.id]
    res.send(`
      <h1>Menu</h1>
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/create">Create TODO</a></li>
        <li><a href="/all">View TODOs</a></li>
      </ul>
      <h2>Write a comment for: ${todo.title}</h2>
      <form action="/details/${todo.id}/comment" method="post">
        <p>Text:</p>
        <textarea name="text" rows="4" cols="50" placeholder="Your comment"></textarea>
        <p><button>Comment</button></p>
      </form>
    `)
  })
})

app.post('/details/:id/comment', function (req, res) {
  getDB(function (e, data) {
    var db = data.db
    var id = req.params.id
    var comment = ''
    req.on('data', function (buf) {
      comment += buf.toString('utf-8')
    })
    req.on('end', function () {
      db[id].comments.push({
        id: db[id].comments.length + 1,
        text: qs.parse(comment).text,
        date: new Date()
      })

      var json = JSON.stringify(db, null, 2)

      fs.writeFile('./db.json', json, 'utf-8', function (err) {
        if (err) throw err
        res.redirect(`/details/${id}`)
      })
    })
  })
})

app.get('/update/:id/:state', function (req, res) {
  getDB(function (e, data) {
    var db = data.db
    var id = req.params.id
    db[id].state = req.params.state // error prone

    var json = JSON.stringify(db, null, 2)

    fs.writeFile('./db.json', json, 'utf-8', function (err) {
      if (err) throw err
      res.redirect('/all')
    })
  })
})

app.get('/all', function (req, res) {
  getDB(function (e, data) {
    var db = data.db
    var todos = Object.keys(data.db)
    var html = `
      <h1>Menu</h1>
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/create">Create TODO</a></li>
        <li><a href="/all">View TODOs</a></li>
      </ul>
      <h2>List of all TODOs</h2>
      ${todos.length ? `<ul>${todos.map(function (id) {
        var todo = db[id]
        var todoLink = `<a href="/details/${todo.id}">${todo.title}: ${todo.descr}</a>`
        var stateLink = todo.state === 'pending'
          ? `, <a href="/update/${id}/done">mark as done</a>`
          : `, <a href="/update/${id}/pending">mark as pending</a>`

        return `<li>${todo.id}. ${todoLink} / ${todo.state + stateLink}</li>`
      })}</ul>` : 'No TODOs found'}
    `
    // dirty hack for template strings
    html = html.replace(/<\/li>,/g, '</li>')
    res.send(html)
  })
})

app.post('/create', function (req, res) {
  var form = new multiparty.Form({
    autoFiles: true,
    uploadDir: './images'
  })

  form.parse(req, function (err, todo, files) {
    if (err) return console.error(err)
    if (!todo.title[0] || !todo.descr[0]) {
      var html = '<h2>Title and description are required</h2>'
      html += 'Go <a href="/create">back</sa> to create form, sorry!'
      res.send(html)
      return
    }

    getDB(function (e, data) {
      var db = data.db
      var id = data.count + 1
      todo.title = todo.title[0]
      todo.descr = todo.descr[0]
      todo.id = id
      todo.state = todo.state[0] && todo.state[0].length && todo.state[0] || 'pending'
      todo.comments = []

      // hack the shits a.k.a
      // it seems it always adds "file"
      // no matter.. even if you didn't click the file input
      todo.img = files.img[0].size === 0 && files.img[0].originalFilename === ''
        ? null
        : '/' + files.img[0].path

      db[id] = todo
      db = JSON.stringify(db, null, 2)


      fs.writeFile('./db.json', db, 'utf-8', function (err) {
        if (err) throw err
        res.redirect(301, '/okey')
      })
    })
  })
})

app.listen(4294, function () {
  console.log('Listening on port 4294')
})
