#!/usr/bin/perl
use strict;
use warnings;

# Scan through all the Kid Radd HTML files and create pre-scaled versions
# of every image in every needed size, because Webkit is terrible.
#
# 2013 Brad Greco <brad@bgreco.net>

# Normal images
my @lines = `grep '<img.*' *.htm`;
foreach(@lines) {
	last;
	my @imgs = split /<img/, $_;
	foreach(@imgs) {
		# Don't bother scaling images to their preload size
		if($_ =~ m/class="preload/) {
			next;
		}
		my $width = 0;
		my $height = 0;
		my $src = '';
		if($_ =~ m/width=['"](\d+)/) {
			$width = $1;
		}
		if($_ =~ m/height=['"](\d+)/) {
			$height = $1;
		}
		if($_ =~ m/src=['"]([^'"]+)/) {
			$src = $1;
		}
		if($src && $width && $height && $src ne 'spacer.gif' && $src ne 'next.gif' && $src ne 'prev.gif' && $src ne 'raddlogo.gif') {
			my $cmd = "convert $src -filter Point -resize $width"."x$height prescaled/$width"."x$height"."_$src";
			print "$cmd\n";
			`$cmd`;
		}
	}
#	last;
}

# Preload images
@lines = `grep Image *.htm | grep -v true`;
my $width = 0;
my $height = 0;
my $src = '';
foreach(@lines) {
	last;
	if($_ =~ m/\((\d+),(\d+)\)/) {
		$width = $1;
		$height = $2;
#		print $_;
	}
	if($_ =~ m/\.src.*"([^"]+)"/) {
		$src = $1;
#		print $_;
		if($src ne 'spacer.gif') {
			my $cmd = "convert $src -filter Point -resize $width"."x$height prescaled/$width"."x$height"."_$src";
			print "$cmd\n";
			`$cmd`;
			
			# Also generate an image with the dimensions reversed,
			# since Dan sometimes got width and height mixed up
			# in his Javascript Image() constructors!
			my $cmdflip = "convert $src -filter Point -resize $height"."x$width prescaled/$height"."x$width"."_$src";
			print "$cmdflip\n";
			`$cmdflip`;
		}
		$width = $height = 0;
	}
}
#print($lines);
#convert raddrock.gif -filter Point -resize 63x96 raddrock63x96.gif

# Preload images, round 2. Turns out not all the predeclared sizes were correct.
# Re-convert everything that returned a 404 after going through the whole comic.
@lines = `cat util/404.txt`;
foreach(@lines) {
	if($_ =~ m/^(\d+)x(\d+)_(.*)/) {
		$width = $1;
		$height = $2;
		$src = $3;
		my $cmd = "convert $src -filter Point -resize $width"."x$height prescaled/$width"."x$height"."_$src";
		print "$cmd\n";
		`$cmd`;
	}
}
